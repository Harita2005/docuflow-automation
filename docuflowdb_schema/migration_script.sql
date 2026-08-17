-- ========================================================
-- DocuFlowDB Baseline Database Schema Migration Script
-- Target Platform: SQL Server 2019 or newer
-- Safe for execution in automated, repeatable environments
-- ========================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- 1. Database Initialization
IF DB_ID(N'DocuFlowDB') IS NULL
BEGIN
    CREATE DATABASE DocuFlowDB;
    PRINT 'Database DocuFlowDB created.';
END;
GO

USE DocuFlowDB;
GO

-- 2. Schema Creation
IF SCHEMA_ID(N'security') IS NULL EXEC(N'CREATE SCHEMA security;');
IF SCHEMA_ID(N'integration') IS NULL EXEC(N'CREATE SCHEMA integration;');
IF SCHEMA_ID(N'core') IS NULL EXEC(N'CREATE SCHEMA core;');
IF SCHEMA_ID(N'rules') IS NULL EXEC(N'CREATE SCHEMA rules;');
IF SCHEMA_ID(N'workflow') IS NULL EXEC(N'CREATE SCHEMA workflow;');
IF SCHEMA_ID(N'audit') IS NULL EXEC(N'CREATE SCHEMA audit;');
GO

-- 3. Security Schema Tables
BEGIN TRANSACTION;

IF OBJECT_ID(N'security.app_users', N'U') IS NULL
BEGIN
    CREATE TABLE security.app_users (
        user_id BIGINT IDENTITY(1,1) CONSTRAINT PK_security_app_users PRIMARY KEY CLUSTERED,
        username NVARCHAR(100) NOT NULL CONSTRAINT UQ_security_app_users_username UNIQUE,
        email NVARCHAR(255) NOT NULL CONSTRAINT UQ_security_app_users_email UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        external_user_key NVARCHAR(100) NOT NULL CONSTRAINT UQ_security_app_users_external_key UNIQUE,
        mfa_enabled BIT NOT NULL CONSTRAINT DF_security_app_users_mfa_enabled DEFAULT 0,
        mfa_type NVARCHAR(50) NOT NULL CONSTRAINT DF_security_app_users_mfa_type DEFAULT N'EMAIL',
        mfa_secret NVARCHAR(255) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_security_app_users_is_active DEFAULT 1,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_security_app_users_created_at DEFAULT SYSUTCDATETIME(),
        row_version ROWVERSION NOT NULL
    );
    PRINT 'Table security.app_users created.';
END;

IF OBJECT_ID(N'security.roles', N'U') IS NULL
BEGIN
    CREATE TABLE security.roles (
        role_id BIGINT IDENTITY(1,1) CONSTRAINT PK_security_roles PRIMARY KEY CLUSTERED,
        role_code NVARCHAR(100) NOT NULL CONSTRAINT UQ_security_roles_role_code UNIQUE,
        description NVARCHAR(250) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_security_roles_created_at DEFAULT SYSUTCDATETIME()
    );
    PRINT 'Table security.roles created.';
END;

IF OBJECT_ID(N'security.user_roles', N'U') IS NULL
BEGIN
    CREATE TABLE security.user_roles (
        user_id BIGINT NOT NULL,
        role_id BIGINT NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_security_user_roles_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_security_user_roles PRIMARY KEY CLUSTERED (user_id, role_id),
        CONSTRAINT FK_security_user_roles_app_users FOREIGN KEY (user_id) REFERENCES security.app_users(user_id) ON DELETE CASCADE,
        CONSTRAINT FK_security_user_roles_roles FOREIGN KEY (role_id) REFERENCES security.roles(role_id) ON DELETE CASCADE
    );
    PRINT 'Table security.user_roles created.';
END;

COMMIT TRANSACTION;
GO

-- 4. Integration Schema Tables
BEGIN TRANSACTION;

IF OBJECT_ID(N'integration.source_systems', N'U') IS NULL
BEGIN
    CREATE TABLE integration.source_systems (
        source_system_id BIGINT IDENTITY(1,1) CONSTRAINT PK_integration_source_systems PRIMARY KEY CLUSTERED,
        system_code NVARCHAR(100) NOT NULL CONSTRAINT UQ_integration_source_systems_system_code UNIQUE,
        system_name NVARCHAR(250) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_integration_source_systems_is_active DEFAULT 1,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_integration_source_systems_created_at DEFAULT SYSUTCDATETIME(),
        row_version ROWVERSION NOT NULL
    );
    PRINT 'Table integration.source_systems created.';
END;

IF OBJECT_ID(N'integration.api_clients', N'U') IS NULL
BEGIN
    CREATE TABLE integration.api_clients (
        client_id BIGINT IDENTITY(1,1) CONSTRAINT PK_integration_api_clients PRIMARY KEY CLUSTERED,
        source_system_id BIGINT NOT NULL,
        client_key NVARCHAR(100) NOT NULL CONSTRAINT UQ_integration_api_clients_client_key UNIQUE,
        client_secret_hash NVARCHAR(255) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_integration_api_clients_is_active DEFAULT 1,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_integration_api_clients_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_integration_api_clients_source_systems FOREIGN KEY (source_system_id) REFERENCES integration.source_systems(source_system_id) ON DELETE NO ACTION
    );
    PRINT 'Table integration.api_clients created.';
END;

IF OBJECT_ID(N'integration.integration_endpoints', N'U') IS NULL
BEGIN
    CREATE TABLE integration.integration_endpoints (
        endpoint_id BIGINT IDENTITY(1,1) CONSTRAINT PK_integration_integration_endpoints PRIMARY KEY CLUSTERED,
        source_system_id BIGINT NOT NULL,
        endpoint_code NVARCHAR(100) NOT NULL CONSTRAINT UQ_integration_integration_endpoints_endpoint_code UNIQUE,
        endpoint_path NVARCHAR(250) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_integration_integration_endpoints_is_active DEFAULT 1,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_integration_integration_endpoints_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_integration_integration_endpoints_source_systems FOREIGN KEY (source_system_id) REFERENCES integration.source_systems(source_system_id) ON DELETE NO ACTION
    );
    PRINT 'Table integration.integration_endpoints created.';
END;

IF OBJECT_ID(N'integration.sync_runs', N'U') IS NULL
BEGIN
    CREATE TABLE integration.sync_runs (
        sync_run_id BIGINT IDENTITY(1,1) CONSTRAINT PK_integration_sync_runs PRIMARY KEY CLUSTERED,
        source_system_id BIGINT NOT NULL,
        idempotency_key NVARCHAR(255) NOT NULL,
        sync_status NVARCHAR(50) NOT NULL,
        records_processed INT NOT NULL CONSTRAINT DF_integration_sync_runs_processed DEFAULT 0,
        started_at DATETIME2(3) NOT NULL CONSTRAINT DF_integration_sync_runs_started DEFAULT SYSUTCDATETIME(),
        completed_at DATETIME2(3) NULL,
        CONSTRAINT UQ_integration_sync_runs_idempotency UNIQUE (source_system_id, idempotency_key),
        CONSTRAINT FK_integration_sync_runs_source_systems FOREIGN KEY (source_system_id) REFERENCES integration.source_systems(source_system_id) ON DELETE NO ACTION,
        CONSTRAINT CK_integration_sync_runs_status CHECK (sync_status IN (N'RUNNING', N'COMPLETED', N'FAILED'))
    );
    PRINT 'Table integration.sync_runs created.';
END;

IF OBJECT_ID(N'integration.source_records', N'U') IS NULL
BEGIN
    CREATE TABLE integration.source_records (
        source_record_id BIGINT IDENTITY(1,1) CONSTRAINT PK_integration_source_records PRIMARY KEY CLUSTERED,
        source_system_id BIGINT NOT NULL,
        sync_run_id BIGINT NOT NULL,
        external_record_key NVARCHAR(255) NOT NULL,
        payload_json NVARCHAR(MAX) NOT NULL,
        ingested_at DATETIME2(3) NOT NULL CONSTRAINT DF_integration_source_records_ingested_at DEFAULT SYSUTCDATETIME(),
        status NVARCHAR(50) NOT NULL,
        canonical_document_id BIGINT NULL, -- Deferred foreign key
        row_version ROWVERSION NOT NULL,
        CONSTRAINT UQ_integration_source_records_key UNIQUE (source_system_id, external_record_key),
        CONSTRAINT FK_integration_source_records_source_systems FOREIGN KEY (source_system_id) REFERENCES integration.source_systems(source_system_id) ON DELETE NO ACTION,
        CONSTRAINT FK_integration_source_records_sync_runs FOREIGN KEY (sync_run_id) REFERENCES integration.sync_runs(sync_run_id) ON DELETE NO ACTION,
        CONSTRAINT CK_integration_source_records_payload_json CHECK (ISJSON(payload_json) = 1),
        CONSTRAINT CK_integration_source_records_status CHECK (status IN (N'RECEIVED', N'VALIDATED', N'NORMALIZED', N'ERROR'))
    );
    PRINT 'Table integration.source_records created.';
END;

IF OBJECT_ID(N'integration.source_record_versions', N'U') IS NULL
BEGIN
    CREATE TABLE integration.source_record_versions (
        source_record_version_id BIGINT IDENTITY(1,1) CONSTRAINT PK_integration_source_record_versions PRIMARY KEY CLUSTERED,
        source_record_id BIGINT NOT NULL,
        version_number INT NOT NULL,
        payload_snapshot_json NVARCHAR(MAX) NOT NULL,
        received_at DATETIME2(3) NOT NULL CONSTRAINT DF_integration_source_record_versions_received_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_integration_source_record_versions_ver UNIQUE (source_record_id, version_number),
        CONSTRAINT FK_integration_source_record_versions_source_records FOREIGN KEY (source_record_id) REFERENCES integration.source_records(source_record_id) ON DELETE CASCADE,
        CONSTRAINT CK_integration_source_record_versions_snapshot CHECK (ISJSON(payload_snapshot_json) = 1)
    );
    PRINT 'Table integration.source_record_versions created.';
END;

COMMIT TRANSACTION;
GO

-- 5. Canonical Document Schema Tables
BEGIN TRANSACTION;

IF OBJECT_ID(N'core.document_types', N'U') IS NULL
BEGIN
    CREATE TABLE core.document_types (
        document_type_id BIGINT IDENTITY(1,1) CONSTRAINT PK_core_document_types PRIMARY KEY CLUSTERED,
        type_code NVARCHAR(100) NOT NULL CONSTRAINT UQ_core_document_types_type_code UNIQUE,
        type_name NVARCHAR(250) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_core_document_types_is_active DEFAULT 1,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_document_types_created_at DEFAULT SYSUTCDATETIME()
    );
    PRINT 'Table core.document_types created.';
END;

IF OBJECT_ID(N'core.documents', N'U') IS NULL
BEGIN
    CREATE TABLE core.documents (
        document_id BIGINT IDENTITY(1,1) CONSTRAINT PK_core_documents PRIMARY KEY CLUSTERED,
        document_type_id BIGINT NOT NULL,
        document_number NVARCHAR(100) NOT NULL,
        created_by_user_id BIGINT NOT NULL,
        status NVARCHAR(50) NOT NULL,
        correlation_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_core_documents_correlation_id DEFAULT NEWID(),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_documents_created_at DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_documents_updated_at DEFAULT SYSUTCDATETIME(),
        row_version ROWVERSION NOT NULL,
        CONSTRAINT UQ_core_documents_number UNIQUE (document_type_id, document_number),
        CONSTRAINT FK_core_documents_document_types FOREIGN KEY (document_type_id) REFERENCES core.document_types(document_type_id) ON DELETE NO ACTION,
        CONSTRAINT FK_core_documents_app_users FOREIGN KEY (created_by_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION,
        CONSTRAINT CK_core_documents_status CHECK (status IN (N'DRAFT', N'SUBMITTED', N'IN_PROGRESS', N'APPROVED', N'REJECTED', N'CANCELLED'))
    );
    PRINT 'Table core.documents created.';
END;

IF OBJECT_ID(N'core.document_versions', N'U') IS NULL
BEGIN
    CREATE TABLE core.document_versions (
        document_version_id BIGINT IDENTITY(1,1) CONSTRAINT PK_core_document_versions PRIMARY KEY CLUSTERED,
        document_id BIGINT NOT NULL,
        version_number INT NOT NULL,
        document_snapshot_json NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_document_versions_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_core_document_versions_ver UNIQUE (document_id, version_number),
        CONSTRAINT FK_core_document_versions_documents FOREIGN KEY (document_id) REFERENCES core.documents(document_id) ON DELETE CASCADE,
        CONSTRAINT CK_core_document_versions_snapshot CHECK (ISJSON(document_snapshot_json) = 1)
    );
    PRINT 'Table core.document_versions created.';
END;

IF OBJECT_ID(N'core.document_metadata', N'U') IS NULL
BEGIN
    CREATE TABLE core.document_metadata (
        metadata_id BIGINT IDENTITY(1,1) CONSTRAINT PK_core_document_metadata PRIMARY KEY CLUSTERED,
        document_id BIGINT NOT NULL,
        meta_key NVARCHAR(100) NOT NULL,
        meta_value NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_document_metadata_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_core_document_metadata_key UNIQUE (document_id, meta_key),
        CONSTRAINT FK_core_document_metadata_documents FOREIGN KEY (document_id) REFERENCES core.documents(document_id) ON DELETE CASCADE
    );
    PRINT 'Table core.document_metadata created.';
END;

IF OBJECT_ID(N'core.document_attachments', N'U') IS NULL
BEGIN
    CREATE TABLE core.document_attachments (
        attachment_id BIGINT IDENTITY(1,1) CONSTRAINT PK_core_document_attachments PRIMARY KEY CLUSTERED,
        document_id BIGINT NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        file_path NVARCHAR(500) NOT NULL,
        file_size_bytes BIGINT NOT NULL,
        uploaded_by_user_id BIGINT NOT NULL,
        uploaded_at DATETIME2(3) NOT NULL CONSTRAINT DF_core_document_attachments_uploaded_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_core_document_attachments_documents FOREIGN KEY (document_id) REFERENCES core.documents(document_id) ON DELETE CASCADE,
        CONSTRAINT FK_core_document_attachments_app_users FOREIGN KEY (uploaded_by_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION
    );
    PRINT 'Table core.document_attachments created.';
END;

-- Deferred Foreign Key Association
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_integration_source_records_documents')
BEGIN
    ALTER TABLE integration.source_records
    ADD CONSTRAINT FK_integration_source_records_documents 
    FOREIGN KEY (canonical_document_id) REFERENCES core.documents(document_id) ON DELETE NO ACTION;
    PRINT 'Deferred Foreign Key FK_integration_source_records_documents added.';
END;

COMMIT TRANSACTION;
GO

-- 6. Business Rules Schema Tables
BEGIN TRANSACTION;

IF OBJECT_ID(N'rules.business_rule_sets', N'U') IS NULL
BEGIN
    CREATE TABLE rules.business_rule_sets (
        rule_set_id BIGINT IDENTITY(1,1) CONSTRAINT PK_rules_business_rule_sets PRIMARY KEY CLUSTERED,
        document_type_id BIGINT NOT NULL,
        rule_set_name NVARCHAR(250) NOT NULL,
        is_published BIT NOT NULL CONSTRAINT DF_rules_business_rule_sets_published DEFAULT 0,
        effective_from DATETIME2(3) NOT NULL,
        effective_to DATETIME2(3) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_rules_business_rule_sets_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_rules_business_rule_sets_document_types FOREIGN KEY (document_type_id) REFERENCES core.document_types(document_type_id) ON DELETE NO ACTION
    );
    PRINT 'Table rules.business_rule_sets created.';
END;

IF OBJECT_ID(N'rules.business_rules', N'U') IS NULL
BEGIN
    CREATE TABLE rules.business_rules (
        rule_id BIGINT IDENTITY(1,1) CONSTRAINT PK_rules_business_rules PRIMARY KEY CLUSTERED,
        rule_set_id BIGINT NOT NULL,
        rule_code NVARCHAR(100) NOT NULL,
        priority INT NOT NULL CONSTRAINT DF_rules_business_rules_priority DEFAULT 10,
        conditions_json NVARCHAR(MAX) NOT NULL,
        target_workflow_definition_id BIGINT NOT NULL, -- Deferred validation link until workflow is created
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_rules_business_rules_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_rules_business_rules_rule_sets FOREIGN KEY (rule_set_id) REFERENCES rules.business_rule_sets(rule_set_id) ON DELETE CASCADE,
        CONSTRAINT CK_rules_business_rules_conditions CHECK (ISJSON(conditions_json) = 1)
    );
    PRINT 'Table rules.business_rules created.';
END;

IF OBJECT_ID(N'rules.rule_evaluation_runs', N'U') IS NULL
BEGIN
    CREATE TABLE rules.rule_evaluation_runs (
        evaluation_run_id BIGINT IDENTITY(1,1) CONSTRAINT PK_rules_rule_evaluation_runs PRIMARY KEY CLUSTERED,
        document_id BIGINT NOT NULL,
        run_time DATETIME2(3) NOT NULL CONSTRAINT DF_rules_rule_evaluation_runs_run_time DEFAULT SYSUTCDATETIME(),
        correlation_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_rules_rule_evaluation_runs_correlation_id DEFAULT NEWID(),
        CONSTRAINT FK_rules_rule_evaluation_runs_documents FOREIGN KEY (document_id) REFERENCES core.documents(document_id) ON DELETE NO ACTION
    );
    PRINT 'Table rules.rule_evaluation_runs created.';
END;

IF OBJECT_ID(N'rules.rule_evaluation_results', N'U') IS NULL
BEGIN
    CREATE TABLE rules.rule_evaluation_results (
        evaluation_result_id BIGINT IDENTITY(1,1) CONSTRAINT PK_rules_rule_evaluation_results PRIMARY KEY CLUSTERED,
        evaluation_run_id BIGINT NOT NULL,
        rule_id BIGINT NOT NULL,
        evaluation_status NVARCHAR(50) NOT NULL,
        error_message NVARCHAR(MAX) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_rules_rule_evaluation_results_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_rules_rule_evaluation_results_evaluation_runs FOREIGN KEY (evaluation_run_id) REFERENCES rules.rule_evaluation_runs(evaluation_run_id) ON DELETE CASCADE,
        CONSTRAINT FK_rules_rule_evaluation_results_business_rules FOREIGN KEY (rule_id) REFERENCES rules.business_rules(rule_id) ON DELETE NO ACTION,
        CONSTRAINT CK_rules_rule_evaluation_results_status CHECK (evaluation_status IN (N'MATCHED', N'NO_MATCH', N'ERROR'))
    );
    PRINT 'Table rules.rule_evaluation_results created.';
END;

COMMIT TRANSACTION;
GO

-- 7. Workflow Design Schema Tables
BEGIN TRANSACTION;

IF OBJECT_ID(N'workflow.workflow_definitions', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_definitions (
        workflow_definition_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_definitions PRIMARY KEY CLUSTERED,
        definition_code NVARCHAR(100) NOT NULL CONSTRAINT UQ_workflow_workflow_definitions_definition_code UNIQUE,
        definition_name NVARCHAR(250) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_workflow_workflow_definitions_is_active DEFAULT 1,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_definitions_created_at DEFAULT SYSUTCDATETIME()
    );
    PRINT 'Table workflow.workflow_definitions created.';
END;

-- Link rules target to workflow definition FK
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_rules_business_rules_definitions')
BEGIN
    ALTER TABLE rules.business_rules
    ADD CONSTRAINT FK_rules_business_rules_definitions
    FOREIGN KEY (target_workflow_definition_id) REFERENCES workflow.workflow_definitions(workflow_definition_id) ON DELETE NO ACTION;
    PRINT 'Foreign Key link FK_rules_business_rules_definitions resolved.';
END;

IF OBJECT_ID(N'workflow.workflow_versions', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_versions (
        workflow_version_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_versions PRIMARY KEY CLUSTERED,
        workflow_definition_id BIGINT NOT NULL,
        version_number INT NOT NULL,
        is_published BIT NOT NULL CONSTRAINT DF_workflow_workflow_versions_published DEFAULT 0,
        effective_from DATETIME2(3) NOT NULL,
        effective_to DATETIME2(3) NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_versions_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_workflow_workflow_versions_number UNIQUE (workflow_definition_id, version_number),
        CONSTRAINT FK_workflow_workflow_versions_definitions FOREIGN KEY (workflow_definition_id) REFERENCES workflow.workflow_definitions(workflow_definition_id) ON DELETE NO ACTION
    );
    PRINT 'Table workflow.workflow_versions created.';
END;

IF OBJECT_ID(N'workflow.workflow_stages', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_stages (
        workflow_stage_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_stages PRIMARY KEY CLUSTERED,
        workflow_version_id BIGINT NOT NULL,
        stage_code NVARCHAR(100) NOT NULL,
        stage_name NVARCHAR(250) NOT NULL,
        sequence_order INT NOT NULL,
        stage_type NVARCHAR(50) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_stages_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_workflow_workflow_stages_code UNIQUE (workflow_version_id, stage_code),
        CONSTRAINT FK_workflow_workflow_stages_versions FOREIGN KEY (workflow_version_id) REFERENCES workflow.workflow_versions(workflow_version_id) ON DELETE NO ACTION,
        CONSTRAINT CK_workflow_workflow_stages_type CHECK (stage_type IN (N'INITIAL', N'OPERATIONAL', N'TERMINAL_APPROVED', N'TERMINAL_REJECTED'))
    );
    PRINT 'Table workflow.workflow_stages created.';
END;

IF OBJECT_ID(N'workflow.workflow_transitions', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_transitions (
        workflow_transition_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_transitions PRIMARY KEY CLUSTERED,
        from_stage_id BIGINT NOT NULL,
        to_stage_id BIGINT NOT NULL,
        transition_trigger NVARCHAR(50) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_transitions_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_workflow_transitions_from FOREIGN KEY (from_stage_id) REFERENCES workflow.workflow_stages(workflow_stage_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_workflow_transitions_to FOREIGN KEY (to_stage_id) REFERENCES workflow.workflow_stages(workflow_stage_id) ON DELETE NO ACTION
    );
    PRINT 'Table workflow.workflow_transitions created.';
END;

IF OBJECT_ID(N'workflow.workflow_assignment_rules', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_assignment_rules (
        assignment_rule_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_assignment_rules PRIMARY KEY CLUSTERED,
        workflow_stage_id BIGINT NOT NULL,
        assignment_type NVARCHAR(50) NOT NULL,
        target_role_id BIGINT NULL,
        target_user_id BIGINT NULL,
        priority INT NOT NULL CONSTRAINT DF_workflow_workflow_assignment_rules_priority DEFAULT 10,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_assignment_rules_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_workflow_assignment_rules_stages FOREIGN KEY (workflow_stage_id) REFERENCES workflow.workflow_stages(workflow_stage_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_workflow_assignment_rules_roles FOREIGN KEY (target_role_id) REFERENCES security.roles(role_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_workflow_assignment_rules_users FOREIGN KEY (target_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION,
        CONSTRAINT CK_workflow_workflow_assignment_rules_type CHECK (assignment_type IN (N'USER', N'ROLE', N'SUBMITTER_MANAGER')),
        CONSTRAINT CK_workflow_workflow_assignment_rules_targets CHECK (
            (assignment_type = N'ROLE' AND target_role_id IS NOT NULL AND target_user_id IS NULL) OR
            (assignment_type = N'USER' AND target_user_id IS NOT NULL AND target_role_id IS NULL) OR
            (assignment_type = N'SUBMITTER_MANAGER' AND target_user_id IS NULL AND target_role_id IS NULL)
        )
    );
    PRINT 'Table workflow.workflow_assignment_rules created.';
END;

IF OBJECT_ID(N'workflow.workflow_checklist_templates', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_checklist_templates (
        checklist_template_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_checklist_templates PRIMARY KEY CLUSTERED,
        workflow_stage_id BIGINT NOT NULL,
        item_text NVARCHAR(500) NOT NULL,
        is_mandatory BIT NOT NULL CONSTRAINT DF_workflow_workflow_checklist_templates_mandatory DEFAULT 1,
        sequence_order INT NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_checklist_templates_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_workflow_checklist_templates_stages FOREIGN KEY (workflow_stage_id) REFERENCES workflow.workflow_stages(workflow_stage_id) ON DELETE NO ACTION
    );
    PRINT 'Table workflow.workflow_checklist_templates created.';
END;

COMMIT TRANSACTION;
GO

-- 8. Workflow Runtime Schema Tables
BEGIN TRANSACTION;

IF OBJECT_ID(N'workflow.workflow_instances', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_instances (
        workflow_instance_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_instances PRIMARY KEY CLUSTERED,
        document_id BIGINT NOT NULL,
        workflow_version_id BIGINT NOT NULL,
        status NVARCHAR(50) NOT NULL,
        started_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_instances_started DEFAULT SYSUTCDATETIME(),
        completed_at DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,
        CONSTRAINT FK_workflow_workflow_instances_documents FOREIGN KEY (document_id) REFERENCES core.documents(document_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_workflow_instances_versions FOREIGN KEY (workflow_version_id) REFERENCES workflow.workflow_versions(workflow_version_id) ON DELETE NO ACTION,
        CONSTRAINT CK_workflow_workflow_instances_status CHECK (status IN (N'ACTIVE', N'COMPLETED', N'TERMINATED'))
    );
    PRINT 'Table workflow.workflow_instances created.';
END;

IF OBJECT_ID(N'workflow.stage_instances', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.stage_instances (
        stage_instance_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_stage_instances PRIMARY KEY CLUSTERED,
        workflow_instance_id BIGINT NOT NULL,
        workflow_stage_id BIGINT NOT NULL,
        status NVARCHAR(50) NOT NULL,
        started_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_stage_instances_started DEFAULT SYSUTCDATETIME(),
        completed_at DATETIME2(3) NULL,
        CONSTRAINT FK_workflow_stage_instances_instances FOREIGN KEY (workflow_instance_id) REFERENCES workflow.workflow_instances(workflow_instance_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_stage_instances_stages FOREIGN KEY (workflow_stage_id) REFERENCES workflow.workflow_stages(workflow_stage_id) ON DELETE NO ACTION,
        CONSTRAINT CK_workflow_stage_instances_status CHECK (status IN (N'PENDING', N'ACTIVE', N'COMPLETED', N'SKIPPED', N'REJECTED'))
    );
    PRINT 'Table workflow.stage_instances created.';
END;

IF OBJECT_ID(N'workflow.task_assignments', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.task_assignments (
        task_assignment_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_task_assignments PRIMARY KEY CLUSTERED,
        stage_instance_id BIGINT NOT NULL,
        assigned_role_id BIGINT NULL,
        assigned_user_id BIGINT NULL,
        status NVARCHAR(50) NOT NULL,
        due_date DATETIME2(3) NULL,
        completed_at DATETIME2(3) NULL,
        row_version ROWVERSION NOT NULL,
        CONSTRAINT FK_workflow_task_assignments_stage_instances FOREIGN KEY (stage_instance_id) REFERENCES workflow.stage_instances(stage_instance_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_task_assignments_roles FOREIGN KEY (assigned_role_id) REFERENCES security.roles(role_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_task_assignments_users FOREIGN KEY (assigned_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION,
        CONSTRAINT CK_workflow_task_assignments_status CHECK (status IN (N'ASSIGNED', N'COMPLETED', N'DELEGATED', N'CANCELLED')),
        CONSTRAINT CK_workflow_task_assignments_targets CHECK (
            (assigned_role_id IS NOT NULL AND assigned_user_id IS NULL) OR
            (assigned_user_id IS NOT NULL AND assigned_role_id IS NULL)
        )
    );
    PRINT 'Table workflow.task_assignments created.';
END;

IF OBJECT_ID(N'workflow.checklist_items', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.checklist_items (
        checklist_item_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_checklist_items PRIMARY KEY CLUSTERED,
        stage_instance_id BIGINT NOT NULL,
        item_text NVARCHAR(500) NOT NULL,
        is_mandatory BIT NOT NULL CONSTRAINT DF_workflow_checklist_items_mandatory DEFAULT 1,
        is_checked BIT NOT NULL CONSTRAINT DF_workflow_checklist_items_checked DEFAULT 0,
        checked_by_user_id BIGINT NULL,
        checked_at DATETIME2(3) NULL,
        CONSTRAINT FK_workflow_checklist_items_stage_instances FOREIGN KEY (stage_instance_id) REFERENCES workflow.stage_instances(stage_instance_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_checklist_items_app_users FOREIGN KEY (checked_by_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION
    );
    PRINT 'Table workflow.checklist_items created.';
END;

IF OBJECT_ID(N'workflow.approval_decisions', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.approval_decisions (
        approval_decision_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_approval_decisions PRIMARY KEY CLUSTERED,
        stage_instance_id BIGINT NOT NULL,
        deciding_user_id BIGINT NOT NULL,
        decision NVARCHAR(50) NOT NULL,
        remarks NVARCHAR(1000) NULL,
        decided_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_approval_decisions_decided_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_approval_decisions_stage_instances FOREIGN KEY (stage_instance_id) REFERENCES workflow.stage_instances(stage_instance_id) ON DELETE NO ACTION,
        CONSTRAINT FK_workflow_approval_decisions_app_users FOREIGN KEY (deciding_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION,
        CONSTRAINT CK_workflow_approval_decisions_decision CHECK (decision IN (N'APPROVED', N'REJECTED', N'HOLD'))
    );
    PRINT 'Table workflow.approval_decisions created.';
END;

IF OBJECT_ID(N'workflow.workflow_instance_events', N'U') IS NULL
BEGIN
    CREATE TABLE workflow.workflow_instance_events (
        event_id BIGINT IDENTITY(1,1) CONSTRAINT PK_workflow_workflow_instance_events PRIMARY KEY CLUSTERED,
        workflow_instance_id BIGINT NOT NULL,
        event_type NVARCHAR(100) NOT NULL,
        payload_json NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_workflow_workflow_instance_events_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_workflow_workflow_instance_events_instances FOREIGN KEY (workflow_instance_id) REFERENCES workflow.workflow_instances(workflow_instance_id) ON DELETE CASCADE,
        CONSTRAINT CK_workflow_workflow_instance_events_payload CHECK (ISJSON(payload_json) = 1)
    );
    PRINT 'Table workflow.workflow_instance_events created.';
END;

COMMIT TRANSACTION;
GO

-- 9. Audit Schema and Event Protection
BEGIN TRANSACTION;

IF OBJECT_ID(N'audit.audit_events', N'U') IS NULL
BEGIN
    CREATE TABLE audit.audit_events (
        audit_event_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_audit_audit_events_event_id DEFAULT NEWID(),
        occurrence_time DATETIME2(3) NOT NULL CONSTRAINT DF_audit_audit_events_occurrence DEFAULT SYSUTCDATETIME(),
        actor_user_id BIGINT NULL,
        source_system_id BIGINT NULL,
        correlation_id UNIQUEIDENTIFIER NOT NULL,
        event_category NVARCHAR(100) NOT NULL,
        event_type NVARCHAR(100) NOT NULL,
        entity_schema NVARCHAR(100) NULL,
        entity_table NVARCHAR(100) NULL,
        entity_id NVARCHAR(100) NULL,
        action_type NVARCHAR(50) NOT NULL,
        before_json NVARCHAR(MAX) NULL,
        after_json NVARCHAR(MAX) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        CONSTRAINT PK_audit_audit_events PRIMARY KEY CLUSTERED (audit_event_id),
        CONSTRAINT FK_audit_audit_events_app_users FOREIGN KEY (actor_user_id) REFERENCES security.app_users(user_id) ON DELETE NO ACTION,
        CONSTRAINT FK_audit_audit_events_source_systems FOREIGN KEY (source_system_id) REFERENCES integration.source_systems(source_system_id) ON DELETE NO ACTION,
        CONSTRAINT CK_audit_audit_events_action CHECK (action_type IN (N'INSERT', N'UPDATE', N'DELETE', N'AUTHENTICATE', N'EXECUTE')),
        CONSTRAINT CK_audit_audit_events_before CHECK (before_json IS NULL OR ISJSON(before_json) = 1),
        CONSTRAINT CK_audit_audit_events_after CHECK (after_json IS NULL OR ISJSON(after_json) = 1),
        CONSTRAINT CK_audit_audit_events_metadata CHECK (metadata_json IS NULL OR ISJSON(metadata_json) = 1)
    );
    PRINT 'Table audit.audit_events created.';
END;

COMMIT TRANSACTION;
GO

-- Create Audit Immutability Trigger
IF OBJECT_ID(N'audit.tr_audit_events_immutability', N'TR') IS NOT NULL
BEGIN
    DROP TRIGGER audit.tr_audit_events_immutability;
END;
GO

CREATE TRIGGER audit.tr_audit_events_immutability
ON audit.audit_events
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Throw standard database-level immutability exception
    THROW 50001, N'Audit log entries are immutable and cannot be updated or deleted.', 1;
END;
GO
PRINT 'Immutability Trigger audit.tr_audit_events_immutability created.';
GO

-- 10. Performance Tuning Indexes
BEGIN TRANSACTION;

-- Source records ingestion searches
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_integration_source_records_ingestion')
BEGIN
    CREATE NONCLUSTERED INDEX IX_integration_source_records_ingestion 
    ON integration.source_records (source_system_id, status, external_record_key, ingested_at);
    PRINT 'Index IX_integration_source_records_ingestion created.';
END;

-- Sync run lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_integration_sync_runs_lookup')
BEGIN
    CREATE NONCLUSTERED INDEX IX_integration_sync_runs_lookup 
    ON integration.sync_runs (source_system_id, idempotency_key);
    PRINT 'Index IX_integration_sync_runs_lookup created.';
END;

-- Canonical Document queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_core_documents_lookup')
BEGIN
    CREATE NONCLUSTERED INDEX IX_core_documents_lookup 
    ON core.documents (document_type_id, status, document_number);
    PRINT 'Index IX_core_documents_lookup created.';
END;

-- Rules set dispatcher lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_rules_business_rule_sets_lookup')
BEGIN
    CREATE NONCLUSTERED INDEX IX_rules_business_rule_sets_lookup 
    ON rules.business_rule_sets (document_type_id, is_published, effective_from) 
    INCLUDE (effective_to);
    PRINT 'Index IX_rules_business_rule_sets_lookup created.';
END;

-- Workflow definitions selector
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_workflow_versions_lookup')
BEGIN
    CREATE NONCLUSTERED INDEX IX_workflow_workflow_versions_lookup 
    ON workflow.workflow_versions (workflow_definition_id, is_published, effective_from) 
    INCLUDE (effective_to);
    PRINT 'Index IX_workflow_workflow_versions_lookup created.';
END;

-- Active workflow routing instances
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_workflow_instances_active')
BEGIN
    CREATE NONCLUSTERED INDEX IX_workflow_workflow_instances_active 
    ON workflow.workflow_instances (document_id, status)
    WHERE status = N'ACTIVE';
    PRINT 'Index IX_workflow_workflow_instances_active created.';
END;

-- Active running stages
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_stage_instances_active')
BEGIN
    CREATE NONCLUSTERED INDEX IX_workflow_stage_instances_active 
    ON workflow.stage_instances (workflow_instance_id, status)
    WHERE status = N'ACTIVE';
    PRINT 'Index IX_workflow_stage_instances_active created.';
END;

-- Task assignments (User inbox)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_task_assignments_user_inbox')
BEGIN
    CREATE NONCLUSTERED INDEX IX_workflow_task_assignments_user_inbox 
    ON workflow.task_assignments (assigned_user_id, status, due_date)
    WHERE assigned_user_id IS NOT NULL AND status = N'ASSIGNED';
    PRINT 'Index IX_workflow_task_assignments_user_inbox created.';
END;

-- Task assignments (Role pool inbox)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_task_assignments_role_inbox')
BEGIN
    CREATE NONCLUSTERED INDEX IX_workflow_task_assignments_role_inbox 
    ON workflow.task_assignments (assigned_role_id, status, due_date)
    WHERE assigned_role_id IS NOT NULL AND status = N'ASSIGNED';
    PRINT 'Index IX_workflow_task_assignments_role_inbox created.';
END;

-- Approval decision logs
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_approval_decisions_history')
BEGIN
    CREATE NONCLUSTERED INDEX IX_workflow_approval_decisions_history 
    ON workflow.approval_decisions (stage_instance_id, decided_at);
    PRINT 'Index IX_workflow_approval_decisions_history created.';
END;

-- Immutable audit queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_audit_audit_events_query')
BEGIN
    CREATE NONCLUSTERED INDEX IX_audit_audit_events_query 
    ON audit.audit_events (entity_schema, entity_table, actor_user_id, correlation_id, occurrence_time);
    PRINT 'Index IX_audit_audit_events_query created.';
END;

COMMIT TRANSACTION;
GO
PRINT 'Migration completed successfully.';
