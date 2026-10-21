# DocuFlow Automated Testing & Test Database Setup Guide

## 1. Safety Guard & Test Isolation Invariant

By default, **all automated test suites and standalone test-runner scripts are strictly prohibited from executing against the live production database (`DocuFlowDB`) or any system database**.

The safety guard in `backend/app/config/test_safety.py` and `backend/tests/conftest.py` actively validates database targets at initialization time. Execution is immediately aborted with a `RuntimeError` if:
- Target is a system database (`master`, `msdb`, `tempdb`, `model`) — always blocked.
- Target contains `"prod"` or `"production"` — always blocked.
- `ENVIRONMENT` is set to `"production"` — always blocked.
- Target is `DocuFlowDB` and `ALLOW_LIVE_DB_TESTS=YES_I_HAVE_A_BACKUP` is NOT explicitly set.
- Target is unset and `ALLOW_LIVE_DB_TESTS=YES_I_HAVE_A_BACKUP` is NOT explicitly set.

---

## 2. Steps to Provision the Isolated Test Database

To run tests safely, an administrator must provision a dedicated test database on the Microsoft SQL Server instance (`192.168.179.22:1443`).

### Step A: Connect to SQL Server & Create Database
Execute in SQL Server Management Studio (SSMS) or via `sqlcmd`:
```sql
-- 1. Create dedicated test database
CREATE DATABASE DocuFlowDB_Test;
GO

-- 2. Verify creation
SELECT name, state_desc FROM sys.databases WHERE name = 'DocuFlowDB_Test';
GO
```

### Step B: Clone Schema from DocuFlowDB
Clone table structures and constraints from `DocuFlowDB` into `DocuFlowDB_Test`.
In SSMS:
1. Right-click `DocuFlowDB` -> **Tasks** -> **Generate Scripts...**
2. Select **Script entire database and all database objects**.
3. In Scripting Options -> **Advanced**, select:
   - *Types of data to script*: **Schema only**.
   - *Script Indexes*: **True**.
   - *Script Primary Keys & Foreign Keys*: **True**.
4. Generate the script and execute it against `DocuFlowDB_Test`.

Alternatively, use PowerShell or `sqlpackage` to extract and publish a DACPAC.

---

## 3. Running Automated Tests

Once `DocuFlowDB_Test` exists and has permissions granted to the database user:

### In PowerShell (Windows):
```powershell
# 1. Explicitly export the test database target
$env:TEST_DB_NAME = "DocuFlowDB_Test"
$env:ENVIRONMENT = "test"

# 2. Run target test suites
pytest backend/tests/test_audit_issues_4_and_5.py -v

# 3. Clear environment variable after test session
Remove-Item Env:\TEST_DB_NAME
```

### In Bash / CI/CD:
```bash
export TEST_DB_NAME="DocuFlowDB_Test"
export ENVIRONMENT="test"

pytest backend/tests/ -v
```

---

## 4. Test Script Safety

Standalone verification scripts located in `backend/scripts/` (e.g. `test_workflow_progression.py`, `test_mfa_send_otp.py`, `test_feedback_actions.py`) also enforce `enforce_test_database_safety()`. They will refuse to run unless `$env:TEST_DB_NAME` is configured.
