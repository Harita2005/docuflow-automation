-- ==========================================
-- DocuFlowDB Seed/Reference Data Script
-- Safe to execute repeatedly (idempotent)
-- ==========================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

BEGIN TRANSACTION;
PRINT 'Seeding security.roles...';
BEGIN
    DECLARE @roles TABLE (role_code NVARCHAR(100), description NVARCHAR(250));
    INSERT INTO @roles (role_code, description) VALUES
    (N'SYSTEM_ADMIN', N'Platform administrator with global operational authority'),
    (N'WORKFLOW_ADMIN', N'Workflow designer and rules manager'),
    (N'REQUESTER', N'Users allowed to initiate source document records'),
    (N'APPROVER', N'Users assigned to review checklist items and authorize stages'),
    (N'AUDITOR', N'ReadOnly access to canonical layers and immutable audit trails');

    MERGE INTO security.roles AS target
    USING @roles AS source
    ON target.role_code = source.role_code
    WHEN NOT MATCHED THEN
        INSERT (role_code, description, created_at)
        VALUES (source.role_code, source.description, SYSUTCDATETIME());
END;

PRINT 'Seeding system accounts...';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM security.app_users WHERE username = N'system')
    BEGIN
        INSERT INTO security.app_users (username, email, password_hash, external_user_key, is_active, created_at)
        VALUES (N'system', N'system@docuflow.local', N'$2b$12$Z0000000000000000000000000000000000000000000000000000', N'system', 1, SYSUTCDATETIME());
    END
    
    IF NOT EXISTS (SELECT 1 FROM security.app_users WHERE username = N'default_approver')
    BEGIN
        INSERT INTO security.app_users (username, email, password_hash, external_user_key, is_active, created_at)
        VALUES (N'default_approver', N'approver@docuflow.local', N'$2b$12$Z0000000000000000000000000000000000000000000000000000', N'approver_1', 1, SYSUTCDATETIME());
    END

    -- Associate default_approver with APPROVER role
    DECLARE @ApproverUserId BIGINT = (SELECT user_id FROM security.app_users WHERE username = N'default_approver');
    DECLARE @ApproverRoleId BIGINT = (SELECT role_id FROM security.roles WHERE role_code = N'APPROVER');
    
    IF @ApproverUserId IS NOT NULL AND @ApproverRoleId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM security.user_roles WHERE user_id = @ApproverUserId AND role_id = @ApproverRoleId)
        BEGIN
            INSERT INTO security.user_roles (user_id, role_id, created_at)
            VALUES (@ApproverUserId, @ApproverRoleId, SYSUTCDATETIME());
        END
    END
END;

PRINT 'Seeding integration.source_systems...';
BEGIN
    DECLARE @systems TABLE (system_code NVARCHAR(100), system_name NVARCHAR(250));
    INSERT INTO @systems (system_code, system_name) VALUES
    (N'APP_A', N'Upstream Invoicing Application A'),
    (N'APP_B', N'Upstream Human Resources Application B'),
    (N'MANUAL', N'Direct Web Portal Manual Entry');

    MERGE INTO integration.source_systems AS target
    USING @systems AS source
    ON target.system_code = source.system_code
    WHEN NOT MATCHED THEN
        INSERT (system_code, system_name, is_active, created_at)
        VALUES (source.system_code, source.system_name, 1, SYSUTCDATETIME());
END;

PRINT 'Seeding integration.integration_endpoints...';
BEGIN
    DECLARE @SysAId BIGINT = (SELECT source_system_id FROM integration.source_systems WHERE system_code = N'APP_A');
    DECLARE @SysBId BIGINT = (SELECT source_system_id FROM integration.source_systems WHERE system_code = N'APP_B');

    IF @SysAId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM integration.integration_endpoints WHERE endpoint_code = N'APP_A_DOC_SYNC')
        BEGIN
            INSERT INTO integration.integration_endpoints (source_system_id, endpoint_code, endpoint_path, is_active, created_at)
            VALUES (@SysAId, N'APP_A_DOC_SYNC', N'/api/v1/sync/app-a', 1, SYSUTCDATETIME());
        END
    END

    IF @SysBId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM integration.integration_endpoints WHERE endpoint_code = N'APP_B_DOC_SYNC')
        BEGIN
            INSERT INTO integration.integration_endpoints (source_system_id, endpoint_code, endpoint_path, is_active, created_at)
            VALUES (@SysBId, N'APP_B_DOC_SYNC', N'/api/v1/sync/app-b', 1, SYSUTCDATETIME());
        END
    END
END;

PRINT 'Seeding core.document_types...';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core.document_types WHERE type_code = N'GENERIC_DOCUMENT')
    BEGIN
        INSERT INTO core.document_types (type_code, type_name, is_active, created_at)
        VALUES (N'GENERIC_DOCUMENT', N'Generic Document Approval Envelope', 1, SYSUTCDATETIME());
    END
END;

PRINT 'Seeding workflow.workflow_definitions & versions...';
BEGIN
    DECLARE @DefId BIGINT;
    IF NOT EXISTS (SELECT 1 FROM workflow.workflow_definitions WHERE definition_code = N'DEFAULT_APPROVAL')
    BEGIN
        INSERT INTO workflow.workflow_definitions (definition_code, definition_name, is_active, created_at)
        VALUES (N'DEFAULT_APPROVAL', N'Default Serial Approval Flow', 1, SYSUTCDATETIME());
    END
    SET @DefId = (SELECT workflow_definition_id FROM workflow.workflow_definitions WHERE definition_code = N'DEFAULT_APPROVAL');

    IF @DefId IS NOT NULL
    BEGIN
        DECLARE @VerId BIGINT;
        IF NOT EXISTS (SELECT 1 FROM workflow.workflow_versions WHERE workflow_definition_id = @DefId AND version_number = 1)
        BEGIN
            INSERT INTO workflow.workflow_versions (workflow_definition_id, version_number, is_published, effective_from, effective_to, created_at)
            VALUES (@DefId, 1, 1, SYSUTCDATETIME(), NULL, SYSUTCDATETIME());
        END
        SET @VerId = (SELECT workflow_version_id FROM workflow.workflow_versions WHERE workflow_definition_id = @DefId AND version_number = 1);

        -- Seed workflow stages for the default version
        IF @VerId IS NOT NULL
        BEGIN
            -- 1. SUBMITTED
            IF NOT EXISTS (SELECT 1 FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'SUBMITTED')
            BEGIN
                INSERT INTO workflow.workflow_stages (workflow_version_id, stage_code, stage_name, sequence_order, stage_type, created_at)
                VALUES (@VerId, N'SUBMITTED', N'Document Submitted', 10, N'INITIAL', SYSUTCDATETIME());
            END
            
            -- 2. REVIEW
            IF NOT EXISTS (SELECT 1 FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'REVIEW')
            BEGIN
                INSERT INTO workflow.workflow_stages (workflow_version_id, stage_code, stage_name, sequence_order, stage_type, created_at)
                VALUES (@VerId, N'REVIEW', N'Managerial Review', 20, N'OPERATIONAL', SYSUTCDATETIME());
            END
            
            -- 3. APPROVED (End Stage)
            IF NOT EXISTS (SELECT 1 FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'APPROVED')
            BEGIN
                INSERT INTO workflow.workflow_stages (workflow_version_id, stage_code, stage_name, sequence_order, stage_type, created_at)
                VALUES (@VerId, N'APPROVED', N'Approved End', 90, N'TERMINAL_APPROVED', SYSUTCDATETIME());
            END
            
            -- 4. REJECTED (End Stage)
            IF NOT EXISTS (SELECT 1 FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'REJECTED')
            BEGIN
                INSERT INTO workflow.workflow_stages (workflow_version_id, stage_code, stage_name, sequence_order, stage_type, created_at)
                VALUES (@VerId, N'REJECTED', N'Rejected End', 99, N'TERMINAL_REJECTED', SYSUTCDATETIME());
            END

            -- Seed transitions and checklist requirements for stages
            DECLARE @StageSubId BIGINT = (SELECT workflow_stage_id FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'SUBMITTED');
            DECLARE @StageRevId BIGINT = (SELECT workflow_stage_id FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'REVIEW');
            DECLARE @StageAppId BIGINT = (SELECT workflow_stage_id FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'APPROVED');
            DECLARE @StageRejId BIGINT = (SELECT workflow_stage_id FROM workflow.workflow_stages WHERE workflow_version_id = @VerId AND stage_code = N'REJECTED');

            -- Transition: Submitted -> Review
            IF @StageSubId IS NOT NULL AND @StageRevId IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM workflow.workflow_transitions WHERE from_stage_id = @StageSubId AND to_stage_id = @StageRevId)
                BEGIN
                    INSERT INTO workflow.workflow_transitions (from_stage_id, to_stage_id, transition_trigger, created_at)
                    VALUES (@StageSubId, @StageRevId, N'AUTO_ROUTE', SYSUTCDATETIME());
                END
            END

            -- Transition: Review -> Approved
            IF @StageRevId IS NOT NULL AND @StageAppId IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM workflow.workflow_transitions WHERE from_stage_id = @StageRevId AND to_stage_id = @StageAppId)
                BEGIN
                    INSERT INTO workflow.workflow_transitions (from_stage_id, to_stage_id, transition_trigger, created_at)
                    VALUES (@StageRevId, @StageAppId, N'APPROVE', SYSUTCDATETIME());
                END
            END

            -- Transition: Review -> Rejected
            IF @StageRevId IS NOT NULL AND @StageRejId IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM workflow.workflow_transitions WHERE from_stage_id = @StageRevId AND to_stage_id = @StageRejId)
                BEGIN
                    INSERT INTO workflow.workflow_transitions (from_stage_id, to_stage_id, transition_trigger, created_at)
                    VALUES (@StageRevId, @StageRejId, N'REJECT', SYSUTCDATETIME());
                END
            END

            -- Seed Assignment Rules for Review Stage: Assign to APPROVER role
            DECLARE @ApproverRole BIGINT = (SELECT role_id FROM security.roles WHERE role_code = N'APPROVER');
            IF @StageRevId IS NOT NULL AND @ApproverRole IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM workflow.workflow_assignment_rules WHERE workflow_stage_id = @StageRevId)
                BEGIN
                    INSERT INTO workflow.workflow_assignment_rules (workflow_stage_id, assignment_type, target_role_id, target_user_id, priority, created_at)
                    VALUES (@StageRevId, N'ROLE', @ApproverRole, NULL, 10, SYSUTCDATETIME());
                END
            END

            -- Seed Checklist Blueprints for Review Stage
            IF @StageRevId IS NOT NULL
            BEGIN
                DECLARE @ChecklistBlueprints TABLE (item_text NVARCHAR(250), is_mandatory BIT, sequence_order INT);
                INSERT INTO @ChecklistBlueprints (item_text, is_mandatory, sequence_order) VALUES
                (N'Verify document metadata integrity against upstream source system', 1, 1),
                (N'Inspect uploaded document attachments for layout clarity', 1, 2),
                (N'Review transaction ledger cost-allocation properties', 0, 3);

                MERGE INTO workflow.workflow_checklist_templates AS target
                USING @ChecklistBlueprints AS source
                ON target.workflow_stage_id = @StageRevId AND target.item_text = source.item_text
                WHEN NOT MATCHED THEN
                    INSERT (workflow_stage_id, item_text, is_mandatory, sequence_order, created_at)
                    VALUES (@StageRevId, source.item_text, source.is_mandatory, source.sequence_order, SYSUTCDATETIME());
            END
        END
    END
END;

COMMIT TRANSACTION;
PRINT 'Seed database references completed successfully.';
