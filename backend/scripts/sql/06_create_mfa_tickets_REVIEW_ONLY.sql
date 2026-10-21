-- ============================================================================
-- FOR HUMAN REVIEW - NOT EXECUTED
-- Script: 06_create_mfa_tickets_REVIEW_ONLY.sql
-- Database: SQL Server (DocuFlowDB)
-- Description: Creates the mfa_tickets table for distributed MFA verification across workers.
-- ============================================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

BEGIN TRY
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'mfa_tickets')
    BEGIN
        CREATE TABLE mfa_tickets (
            ticket VARCHAR(128) PRIMARY KEY,
            username VARCHAR(150) NOT NULL,
            email VARCHAR(255) NULL,
            user_id INT NULL,
            hashed_otp VARCHAR(255) NULL,
            role VARCHAR(50) NULL,
            attempts INT NOT NULL DEFAULT 0,
            max_attempts INT NOT NULL DEFAULT 5,
            channel VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
            created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
            expires_at DATETIME NOT NULL
        );

        CREATE INDEX IX_mfa_tickets_username ON mfa_tickets (username);
        CREATE INDEX IX_mfa_tickets_expires_at ON mfa_tickets (expires_at);

        PRINT 'SUCCESS: Table mfa_tickets created successfully.';
    END
    ELSE
    BEGIN
        PRINT 'NOTICE: Table mfa_tickets already exists.';
    END

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    PRINT 'ERROR creating mfa_tickets table: ' + @ErrorMessage;
    RAISERROR (@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
