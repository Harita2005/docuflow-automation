# Database Least-Privilege Account Setup Guide (SEC-08)

## 1. Overview
In accordance with security finding **SEC-08**, the DocuFlow application must operate using a dedicated, least-privilege database account instead of an administrative account (`sa`, `sysadmin`, or unbounded Windows Authentication).

The least-privilege database user `docuflow_app` is restricted to:
- **`db_datareader`**: Read access (`SELECT`) across DocuFlowDB tables.
- **`db_datawriter`**: Write access (`INSERT`, `UPDATE`, `DELETE`) across DocuFlowDB tables.
- **`EXECUTE ON SCHEMA::dbo`**: Execution permissions for required callback and invoice stored procedures.
- **Explicit DENY**: Prevent schema modifications (`ALTER SCHEMA`, `ALTER USER`, `ALTER ROLE`, `DROP TABLE`).

---

## 2. Step-by-Step Instructions for Database Administrator

### Step 1: Open SQL Server Management Studio (SSMS) or sqlcmd
Connect to the Microsoft SQL Server instance hosting `DocuFlowDB`:
- **Server**: `192.168.179.22,1443`
- **Authentication**: SQL Server Authentication or Windows Authentication as a DBA / Sysadmin.

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

### Step 3: Execute the Script
Run the script in SSMS (`F5`) or via `sqlcmd`:
```bash
sqlcmd -S 192.168.179.22,1443 -U sa -P <SA_PASSWORD> -i scripts/sql/01_create_least_privilege_app_user.sql
```
Verify the output confirms:
```
Assigning least-privilege roles db_datareader and db_datawriter...
Granting EXECUTE permissions on application stored procedures...
Least-privilege database account [docuflow_app] configured successfully.
```

### Step 4: Update Application Configuration
Update the `.env` file on the application server:
```ini
DB_HOST="192.168.179.22"
DB_PORT="1443"
DB_NAME="DocuFlowDB"
DB_USER="docuflow_app"
DB_PASSWORD="<THE_PASSWORD_YOU_CONFIGURED>"
```

### Step 5: Test Connectivity
Run the test command or start the backend:
```bash
python -c "from app.database.connection import SessionLocal; db = SessionLocal(); print('Connection successful:', db.execute('SELECT 1').scalar())"
```

---

## 3. Rollback Procedure
If you need to revert to previous settings:
1. Restore previous credentials in `.env`.
2. Disable the application login in SQL Server:
```sql
ALTER LOGIN [docuflow_app] DISABLE;
```
