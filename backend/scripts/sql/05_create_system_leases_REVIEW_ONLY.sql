-- ============================================================================
-- FOR HUMAN REVIEW - NOT EXECUTED
-- Script: 05_create_system_leases_REVIEW_ONLY.sql
-- Database: SQL Server (DocuFlowDB)
-- Description: Creates the system_leases table for distributed single-instance task execution
--              across multiple workers or pods.
-- ============================================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

BEGIN TRY
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'system_leases')
    BEGIN
        CREATE TABLE system_leases (
            lease_name VARCHAR(100) PRIMARY KEY,
            owner_id VARCHAR(150) NOT NULL,
            acquired_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
            expires_at DATETIME NOT NULL
        );

        CREATE INDEX IX_system_leases_expires_at ON system_leases (expires_at);

        PRINT 'SUCCESS: Table system_leases created successfully.';
    END
    ELSE
    BEGIN
        PRINT 'NOTICE: Table system_leases already exists.';
    END

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    PRINT 'ERROR creating system_leases table: ' + @ErrorMessage;
    RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
