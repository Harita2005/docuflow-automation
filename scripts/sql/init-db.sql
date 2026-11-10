-- ============================================================================
-- DocuFlow Database Initialization Script for Docker Containerization
-- ============================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'DocuFlowDB')
BEGIN
    CREATE DATABASE DocuFlowDB;
    PRINT 'Database DocuFlowDB created successfully.';
END
ELSE
BEGIN
    PRINT 'Database DocuFlowDB already exists.';
END
GO

USE DocuFlowDB;
GO

-- Atomic sequence for enterprise document sequence numbering
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'document_id_seq')
BEGIN
    CREATE SEQUENCE dbo.document_id_seq
        AS BIGINT
        START WITH 1
        INCREMENT BY 1
        MINVALUE 1
        NO CYCLE
        CACHE 10;
    PRINT 'Sequence document_id_seq created successfully.';
END
GO
