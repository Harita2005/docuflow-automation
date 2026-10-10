-- =============================================================================
-- DocuFlow Automation - Least-Privilege Application Database Account Creation
-- Target Engine: Microsoft SQL Server 2017+
-- Target Database: DocuFlowDB
-- Security Finding: SEC-08 (Least-Privilege Database Principle)
-- =============================================================================

USE [master];
GO

-- 1. Create Server Login (if not exists)
IF NOT EXISTS (SELECT name FROM sys.server_principals WHERE name = 'docuflow_app')
BEGIN
    PRINT 'Creating server login [docuflow_app]...';
    -- IMPORTANT: Replace '<STRONG_COMPLEX_PASSWORD_HERE>' with a secure generated password before executing!
    CREATE LOGIN [docuflow_app]
        WITH PASSWORD = '<STRONG_COMPLEX_PASSWORD_HERE>',
        CHECK_POLICY = ON,
        CHECK_EXPIRATION = OFF;
END
ELSE
BEGIN
    PRINT 'Server login [docuflow_app] already exists.';
END
GO

USE [DocuFlowDB];
GO

-- 2. Create Database User mapped to Server Login
IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'docuflow_app')
BEGIN
    PRINT 'Creating database user [docuflow_app] in DocuFlowDB...';
    CREATE USER [docuflow_app] FOR LOGIN [docuflow_app];
END
ELSE
BEGIN
    PRINT 'Database user [docuflow_app] already exists in DocuFlowDB.';
END
GO

-- 3. Grant Minimum Necessary Data Roles (Read and Write)
PRINT 'Assigning least-privilege roles db_datareader and db_datawriter...';
ALTER ROLE [db_datareader] ADD MEMBER [docuflow_app];
ALTER ROLE [db_datawriter] ADD MEMBER [docuflow_app];
GO

-- 4. Grant Stored Procedure Execution Rights
PRINT 'Granting EXECUTE permissions on application stored procedures...';
GRANT EXECUTE ON SCHEMA::dbo TO [docuflow_app];
GO

-- 5. Explicitly Deny High-Risk Administrative / DDL Operations and Protect Audit Immutability
PRINT 'Explicitly denying high-privilege administrative actions...';
DENY ALTER ANY USER TO [docuflow_app];
DENY ALTER ANY ROLE TO [docuflow_app];
DENY ALTER ANY SCHEMA TO [docuflow_app];
DENY VIEW ANY DEFINITION TO [docuflow_app];

-- SEC-08 Audit Log Immutability: Make audit and log tables insert-only for application account
PRINT 'Enforcing append-only audit trail: denying UPDATE and DELETE on audit/log tables...';
IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL
    DENY UPDATE, DELETE ON dbo.audit_logs TO [docuflow_app];
IF OBJECT_ID('dbo.user_access_logs', 'U') IS NOT NULL
    DENY UPDATE, DELETE ON dbo.user_access_logs TO [docuflow_app];
IF OBJECT_ID('dbo.system_logs', 'U') IS NOT NULL
    DENY UPDATE, DELETE ON dbo.system_logs TO [docuflow_app];
GO

-- 6. Verification
PRINT 'Verifying permissions for [docuflow_app]...';
SELECT 
    dp.name AS PrincipalName,
    dp.type_desc AS PrincipalType,
    o.name AS ObjectName,
    p.permission_name AS Permission,
    p.state_desc AS PermissionState
FROM sys.database_permissions p
JOIN sys.database_principals dp ON p.grantee_principal_id = dp.principal_id
LEFT JOIN sys.objects o ON p.major_id = o.object_id
WHERE dp.name = 'docuflow_app';
GO

PRINT 'Least-privilege database account [docuflow_app] configured successfully.';
GO
