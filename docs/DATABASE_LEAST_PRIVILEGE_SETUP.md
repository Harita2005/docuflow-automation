# Database Least-Privilege Account Setup Guide (SEC-08)

**Status:** Script provided, pending DBA execution

## 1. Overview
In accordance with security finding **SEC-08**, the DocuFlow application must operate using a dedicated, least-privilege database account instead of an administrative account (`sa`, `sysadmin`, or unbounded Windows Authentication).

The least-privilege database user `docuflow_app` is restricted to:
- **`db_datareader`**: Read access (`SELECT`) across DocuFlowDB tables.
- **`db_datawriter`**: Write access (`INSERT`, `UPDATE`, `DELETE`) across DocuFlowDB tables.
- **`EXECUTE ON SCHEMA::dbo`**: Execution permissions for required callback and invoice stored procedures.
- **Append-Only Audit Protection**: Explicit `DENY UPDATE, DELETE` on `dbo.audit_logs`, `dbo.user_access_logs`, and `dbo.system_logs` to ensure audit trail immutability.
- **Explicit DENY**: Prevent schema modifications (`ALTER SCHEMA`, `ALTER USER`, `ALTER ROLE`, `DROP TABLE`, `VIEW DEFINITION`).
- **Separate DDL Migrations**: Application startup (`main.py`) runs pure DML operations. All schema changes, table creation, and indexes are maintained separately via `backend/scripts/migrations/run_db_migrations.py` executed by the DBA under an admin account.

---

## 2. Step-by-Step Instructions for Database Administrator

### Step 1: Open SQL Server Management Studio (SSMS) or sqlcmd
Connect to the Microsoft SQL Server instance hosting `DocuFlowDB`:
- **Server**: `192.168.179.22,1443`
- **Authentication**: Connect with integrated Windows Authentication or DBA admin credentials.

### Step 2: Open and Configure the Script
Open the provided SQL script:
```
scripts/sql/01_create_least_privilege_app_user.sql
```
Locate line 16:
```sql
CREATE LOGIN [docuflow_app]
    WITH PASSWORD = '<STRONG_COMPLEX_PASSWORD_HERE>',
```
Replace `<STRONG_COMPLEX_PASSWORD_HERE>` with a newly generated, high-entropy password (minimum 24 characters with mixed case, numbers, and symbols).

### Step 3: Run Database Migrations (Admin Account)
Before switching the application user, run any pending DDL migrations using your DBA account:
```bash
python backend/scripts/migrations/run_db_migrations.py
```

### Step 4: Execute the Least-Privilege SQL Script
Run the script using Windows Authentication (`-E`) or interactive password prompt (never pass plaintext passwords in command flags):

Using Windows Authentication:
```bash
sqlcmd -S 192.168.179.22,1443 -d DocuFlowDB -E -i scripts/sql/01_create_least_privilege_app_user.sql
```

Or using SQL Authentication with password prompt:
```bash
sqlcmd -S 192.168.179.22,1443 -d DocuFlowDB -U sa -i scripts/sql/01_create_least_privilege_app_user.sql
```
*(sqlcmd will securely prompt for the password without shell history leakage).*

Verify the output confirms:
```
Assigning least-privilege roles db_datareader and db_datawriter...
Granting EXECUTE permissions on application stored procedures...
Enforcing append-only audit trail: denying UPDATE and DELETE on audit/log tables...
Least-privilege database account [docuflow_app] configured successfully.
```

### Step 5: Update Application Configuration
Update the `.env` file on the application server:
```ini
DB_HOST="192.168.179.22"
DB_PORT="1443"
DB_NAME="DocuFlowDB"
DB_USER="docuflow_app"
DB_PASSWORD="<THE_PASSWORD_YOU_CONFIGURED>"
```

### Step 6: Test Connectivity
Verify that the application can query using `sqlalchemy.text('SELECT 1')`:
```bash
python -c "from sqlalchemy import text; from app.database.connection import SessionLocal; db = SessionLocal(); print('Connection successful:', db.execute(text('SELECT 1')).scalar())"
```

---

## 3. Rollback Procedure
If unexpected permission issues arise in staging/production:

1. **Revert Environment Variables**:
   Restore the previous database credentials in `.env` (or set `DB_USER` back to the administrative staging user) and restart the application service.

2. **Revoke and Disable `docuflow_app`**:
   In SSMS or `sqlcmd`, run:
   ```sql
   USE [DocuFlowDB];
   GO
   -- Revoke user permissions
   ALTER ROLE [db_datareader] DROP MEMBER [docuflow_app];
   ALTER ROLE [db_datawriter] DROP MEMBER [docuflow_app];
   REVOKE EXECUTE ON SCHEMA::dbo FROM [docuflow_app];
   DROP USER [docuflow_app];
   GO

   USE [master];
   GO
   -- Disable or remove login
   ALTER LOGIN [docuflow_app] DISABLE;
   -- Or to completely remove:
   -- DROP LOGIN [docuflow_app];
   GO
   ```

3. **Verify App Functionality**:
   Confirm backend service restores normal operation.
