-- ============================================================================
-- SCRIPT: 03_cleanup_test_data_REVIEW_ONLY.sql
-- STATUS: FOR HUMAN REVIEW - NOT EXECUTED
-- 
-- [!] CRITICAL SAFETY WARNING:
-- TAKE A FULL BACKUP OF DocuFlowDB BEFORE EXECUTING THIS SCRIPT.
-- Example in SSMS or sqlcmd:
--   BACKUP DATABASE [DocuFlowDB] 
--   TO DISK = 'C:\Backups\DocuFlowDB_before_cleanup.bak' 
--   WITH INIT, COMPRESSION, STATS = 10;
-- GO
--
-- TARGET DATABASE: DocuFlowDB (Microsoft SQL Server)
-- PURPOSE:
--   Removes residual test data (35 test documents, 2-5 test users, 3 test workflow profiles)
--   created during prior test executions.
--   Enforces child-to-parent deletion order according to foreign key constraints in models.py.
--   Uses SET XACT_ABORT ON, BEGIN TRANSACTION, TRY...CATCH, and strict row count assertions.
--   If deleted row counts exceed expected bounds, the transaction automatically ROLLS BACK.
-- ============================================================================

USE [DocuFlowDB];
GO

-- ----------------------------------------------------------------------------
-- SECTION 1: READ-ONLY AUDIT & PREVIEW SELECTS
-- Run these statements first to inspect the exact rows targeted for deletion.
-- ----------------------------------------------------------------------------

PRINT '====================================================================';
PRINT 'PREVIEW: TARGET TEST DOCUMENTS';
PRINT '====================================================================';
SELECT 
    id, 
    doc_key, 
    invoice_number, 
    vendor_name, 
    document_type, 
    division, 
    status, 
    created_at
FROM dbo.documents
WHERE id LIKE 'TEST-%' 
   OR id LIKE 'DOC-MOREINFO-%'
   OR document_type IN ('NON_EXISTENT_DOC_TYPE_FOR_TEST', 'UNIQUE_AUTO_MATCH_TYPE');

PRINT '====================================================================';
PRINT 'PREVIEW: TARGET TEST USERS';
PRINT '====================================================================';
SELECT 
    id, 
    username, 
    employee_id, 
    email, 
    role, 
    division, 
    is_active, 
    created_at
FROM dbo.users
WHERE username IN (
    'test_deact_mfa_user', 
    'test_locked_user', 
    'TEST_AUDIT_APPROVER', 
    'TEST_AUDIT_USER_1', 
    'TEST_AUDIT_ADMIN'
);

PRINT '====================================================================';
PRINT 'PREVIEW: TARGET TEST WORKFLOW PROFILES & STEPS';
PRINT '====================================================================';
SELECT 
    wp.id AS profile_id, 
    wp.profile_name, 
    wp.workflow_code, 
    wp.workflow_type, 
    COUNT(wsd.id) AS step_count
FROM dbo.workflow_profiles wp
LEFT JOIN dbo.workflow_step_definitions wsd ON wp.profile_name = wsd.profile_name
WHERE wp.profile_name IN ('TEST_WF_AUTO_1', 'TEST_WF_AUTO_2', 'TEST_MULTI_STAGE_WF')
GROUP BY wp.id, wp.profile_name, wp.workflow_code, wp.workflow_type;

PRINT '====================================================================';
PRINT 'PREVIEW: TARGET TEST BUSINESS RULES';
PRINT '====================================================================';
SELECT 
    id, 
    rule_name, 
    rule_category, 
    document_type, 
    target_workflow_id, 
    created_at
FROM dbo.business_rules
WHERE rule_name LIKE 'TEST_%' 
   OR rule_name LIKE 'TEST-%';
GO


-- ----------------------------------------------------------------------------
-- SECTION 2: TRANSACTIONAL SAFE CLEANUP
-- DO NOT EXECUTE AUTOMATICALLY. REVIEW FIRST.
-- ----------------------------------------------------------------------------

SET XACT_ABORT ON;
BEGIN TRANSACTION;

BEGIN TRY
    -- ------------------------------------------------------------------------
    -- 1. Identify Target Document IDs in a temporary table for child cascade
    -- ------------------------------------------------------------------------
    IF OBJECT_ID('tempdb..#TargetDocs') IS NOT NULL DROP TABLE #TargetDocs;
    CREATE TABLE #TargetDocs (id VARCHAR(255) PRIMARY KEY);

    INSERT INTO #TargetDocs (id)
    SELECT id 
    FROM dbo.documents
    WHERE id LIKE 'TEST-%' 
       OR id LIKE 'DOC-MOREINFO-%'
       OR document_type IN ('NON_EXISTENT_DOC_TYPE_FOR_TEST', 'UNIQUE_AUTO_MATCH_TYPE');

    DECLARE @TargetDocCount INT = (SELECT COUNT(1) FROM #TargetDocs);
    PRINT 'Identified test documents for cleanup: ' + CAST(@TargetDocCount AS VARCHAR(10));

    -- Safety assertion: Stop if target document count exceeds 50
    IF @TargetDocCount > 50
    BEGIN
        RAISERROR('SAFETY ABORT: Target document count (%d) exceeds safety threshold (50). Rolling back.', 16, 1, @TargetDocCount);
    END;

    -- ------------------------------------------------------------------------
    -- 2. Identify Target User IDs in a temporary table
    -- ------------------------------------------------------------------------
    IF OBJECT_ID('tempdb..#TargetUsers') IS NOT NULL DROP TABLE #TargetUsers;
    CREATE TABLE #TargetUsers (id INT PRIMARY KEY, username VARCHAR(255));

    INSERT INTO #TargetUsers (id, username)
    SELECT id, username 
    FROM dbo.users
    WHERE username IN (
        'test_deact_mfa_user', 
        'test_locked_user', 
        'TEST_AUDIT_APPROVER', 
        'TEST_AUDIT_USER_1', 
        'TEST_AUDIT_ADMIN'
    );

    DECLARE @TargetUserCount INT = (SELECT COUNT(1) FROM #TargetUsers);
    PRINT 'Identified test users for cleanup: ' + CAST(@TargetUserCount AS VARCHAR(10));

    IF @TargetUserCount > 10
    BEGIN
        RAISERROR('SAFETY ABORT: Target user count (%d) exceeds safety threshold (10). Rolling back.', 16, 1, @TargetUserCount);
    END;

    -- ------------------------------------------------------------------------
    -- 3. Delete Document Child Tables (foreign key children first)
    -- ------------------------------------------------------------------------

    -- 3a. Callback attempts (child of callback_events)
    DELETE ca
    FROM dbo.callback_attempts ca
    INNER JOIN dbo.callback_events ce ON ca.callback_event_id = ce.id
    INNER JOIN #TargetDocs td ON ce.document_id = td.id;
    PRINT 'Deleted callback_attempts for test documents: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3b. Callback events
    DELETE ce
    FROM dbo.callback_events ce
    INNER JOIN #TargetDocs td ON ce.document_id = td.id;
    PRINT 'Deleted callback_events for test documents: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3c. Approval assignments
    DELETE aa
    FROM dbo.approval_assignments aa
    WHERE aa.document_id IN (SELECT id FROM #TargetDocs)
       OR aa.approver_user_id IN (SELECT id FROM #TargetUsers);
    PRINT 'Deleted approval_assignments: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3d. Document locks
    DELETE dl
    FROM dbo.document_locks dl
    WHERE dl.document_id IN (SELECT id FROM #TargetDocs)
       OR dl.user_id IN (SELECT id FROM #TargetUsers);
    PRINT 'Deleted document_locks: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3e. Document approval logs
    DELETE dal
    FROM dbo.document_approval_logs dal
    INNER JOIN #TargetDocs td ON dal.invoice_id = td.id;
    PRINT 'Deleted document_approval_logs: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3f. Document checklist states
    DELETE dcs
    FROM dbo.document_checklist_states dcs
    INNER JOIN #TargetDocs td ON dcs.invoice_id = td.id;
    PRINT 'Deleted document_checklist_states: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3g. Document line items
    DELETE dli
    FROM dbo.document_line_items dli
    INNER JOIN #TargetDocs td ON dli.invoice_id = td.id;
    PRINT 'Deleted document_line_items: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3h. Integration sync logs
    DELETE isl
    FROM dbo.integration_sync_logs isl
    INNER JOIN #TargetDocs td ON isl.document_id = td.id;
    PRINT 'Deleted integration_sync_logs: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3i. System engine logs
    DELETE sel
    FROM dbo.system_engine_logs sel
    INNER JOIN #TargetDocs td ON sel.invoice_id = td.id;
    PRINT 'Deleted system_engine_logs: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3j. Audit logs
    DELETE al
    FROM dbo.audit_logs al
    INNER JOIN #TargetDocs td ON al.invoice_id = td.id;
    PRINT 'Deleted audit_logs for test documents: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 3k. In-app notifications
    DELETE ian
    FROM dbo.in_app_notifications ian
    INNER JOIN #TargetDocs td ON ian.document_id = td.id;
    PRINT 'Deleted in_app_notifications: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- ------------------------------------------------------------------------
    -- 4. Delete Target Documents (Parent Table)
    -- ------------------------------------------------------------------------
    DELETE d
    FROM dbo.documents d
    INNER JOIN #TargetDocs td ON d.id = td.id;
    DECLARE @DeletedDocCount INT = @@ROWCOUNT;
    PRINT 'Deleted test documents: ' + CAST(@DeletedDocCount AS VARCHAR(10));

    IF @DeletedDocCount <> @TargetDocCount
    BEGIN
        RAISERROR('SAFETY ABORT: Deleted document count (%d) does not match expected target count (%d). Rolling back.', 16, 1, @DeletedDocCount, @TargetDocCount);
    END;

    -- ------------------------------------------------------------------------
    -- 5. Delete User Child Tables
    -- ------------------------------------------------------------------------
    DELETE ov
    FROM dbo.otp_verifications ov
    INNER JOIN #TargetUsers tu ON ov.user_id = tu.id;
    PRINT 'Deleted otp_verifications for test users: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    DELETE dtfc
    FROM dbo.document_type_field_configurations dtfc
    INNER JOIN #TargetUsers tu ON dtfc.user_id = tu.id;
    PRINT 'Deleted document_type_field_configurations for test users: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- ------------------------------------------------------------------------
    -- 6. Delete Target Users (Parent Table)
    -- ------------------------------------------------------------------------
    DELETE u
    FROM dbo.users u
    INNER JOIN #TargetUsers tu ON u.id = tu.id;
    DECLARE @DeletedUserCount INT = @@ROWCOUNT;
    PRINT 'Deleted test users: ' + CAST(@DeletedUserCount AS VARCHAR(10));

    -- ------------------------------------------------------------------------
    -- 7. Delete Test Workflow Step Definitions (Child) & Profiles (Parent)
    -- Excludes workflow profile id 6145 or any production profiles.
    -- ------------------------------------------------------------------------
    DELETE wsd
    FROM dbo.workflow_step_definitions wsd
    WHERE wsd.profile_name IN ('TEST_WF_AUTO_1', 'TEST_WF_AUTO_2', 'TEST_MULTI_STAGE_WF');
    PRINT 'Deleted test workflow_step_definitions: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    DELETE wp
    FROM dbo.workflow_profiles wp
    WHERE wp.profile_name IN ('TEST_WF_AUTO_1', 'TEST_WF_AUTO_2', 'TEST_MULTI_STAGE_WF');
    DECLARE @DeletedWfCount INT = @@ROWCOUNT;
    PRINT 'Deleted test workflow_profiles: ' + CAST(@DeletedWfCount AS VARCHAR(10));

    IF @DeletedWfCount > 3
    BEGIN
        RAISERROR('SAFETY ABORT: Deleted workflow profiles count (%d) exceeds 3. Rolling back.', 16, 1, @DeletedWfCount);
    END;

    -- ------------------------------------------------------------------------
    -- 8. Delete Test Business Rules
    -- ------------------------------------------------------------------------
    DELETE br
    FROM dbo.business_rules br
    WHERE br.rule_name LIKE 'TEST_%' 
       OR br.rule_name LIKE 'TEST-%';
    PRINT 'Deleted test business_rules: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- Clean up temporary tables
    DROP TABLE #TargetDocs;
    DROP TABLE #TargetUsers;

    -- Commit transaction
    COMMIT TRANSACTION;
    PRINT '====================================================================';
    PRINT 'SUCCESS: Cleanup of residual test data committed successfully.';
    PRINT '====================================================================';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrSev INT = ERROR_SEVERITY();
    DECLARE @ErrState INT = ERROR_STATE();
    PRINT '====================================================================';
    PRINT 'ERROR ENCOUNTERED. TRANSACTION ROLLED BACK: ' + @ErrMsg;
    PRINT '====================================================================';
    RAISERROR(@ErrMsg, @ErrSev, @ErrState);
END CATCH;
GO
