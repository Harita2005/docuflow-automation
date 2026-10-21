-- ============================================================================
-- FOR HUMAN REVIEW - NOT EXECUTED
-- Script: 04_create_audit_log_archive_REVIEW_ONLY.sql
-- Database: SQL Server (DocuFlowDB)
-- Description: Creates the audit_log_archive table to safely store archived audit logs
--              prior to any retention cleanup.
-- ============================================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

BEGIN TRY
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_log_archive')
    BEGIN
        CREATE TABLE audit_log_archive (
            archive_id INT IDENTITY(1,1) PRIMARY KEY,
            original_id INT NOT NULL,
            invoice_id VARCHAR(100) NULL,
            [user] VARCHAR(150) NOT NULL,
            action VARCHAR(100) NOT NULL,
            stage VARCHAR(100) NULL,
            notes NVARCHAR(MAX) NULL,
            ip_address VARCHAR(50) NULL,
            approver_user_id INT NULL,
            stage_id INT NULL,
            previous_status VARCHAR(50) NULL,
            new_status VARCHAR(50) NULL,
            remarks NVARCHAR(MAX) NULL,
            timestamp DATETIME NOT NULL,
            archived_at DATETIME NOT NULL DEFAULT GETUTCDATE()
        );

        CREATE INDEX IX_audit_log_archive_invoice_id ON audit_log_archive (invoice_id);
        CREATE INDEX IX_audit_log_archive_timestamp ON audit_log_archive (timestamp);
        CREATE INDEX IX_audit_log_archive_archived_at ON audit_log_archive (archived_at);

        PRINT 'SUCCESS: Table audit_log_archive created successfully.';
    END
    ELSE
    BEGIN
        PRINT 'NOTICE: Table audit_log_archive already exists.';
    END

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    PRINT 'ERROR creating audit_log_archive table: ' + @ErrorMessage;
    RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
