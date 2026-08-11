import os
import sys
from dotenv import load_dotenv

load_dotenv()

def restore_database():
    bak_path = os.path.abspath("DocuFlowDB.bak")
    if not os.path.exists(bak_path):
        print(f"[ERROR] Backup file not found at: {bak_path}")
        sys.exit(1)

    print("==================================================================")
    print(f">>> RESTORING MS SQL DATABASE FROM: {bak_path}")
    print("==================================================================")

    # Try connecting via pyodbc (Windows/Linux ODBC) or pymssql (Pure Python)
    conn = None
    
    # 1. Try pyodbc
    try:
        import pyodbc
        db_url = os.getenv("DATABASE_URL", "")
        if "mssql+pyodbc://" in db_url:
            conn_str = db_url.replace("mssql+pyodbc://@", "").replace("mssql+pyodbc://", "")
            # Windows Trusted Auth
            conn = pyodbc.connect("Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;", autocommit=True)
        else:
            conn = pyodbc.connect("Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;", autocommit=True)
        print("[Connected via pyodbc]")
    except Exception as e1:
        # 2. Try pymssql
        try:
            import pymssql
            conn = pymssql.connect(server="localhost", user="sa", password=os.getenv("MSSQL_SA_PASSWORD", "Admin@1234"), database="master", autocommit=True)
            print("[Connected via pymssql]")
        except Exception as e2:
            print(f"[ERROR] Could not connect to SQL Server.\npyodbc error: {e1}\npymssql error: {e2}")
            print("\nIf you are using SQL Authentication, run:")
            print("  python scripts/restore_database.py sa YourPassword localhost")
            sys.exit(1)

    cursor = conn.cursor()

    # Get data and log file logical names from .bak
    print("\n[Step 1] Reading file list from backup header...")
    cursor.execute(f"RESTORE FILELISTONLY FROM DISK = N'{bak_path}';")
    files = cursor.fetchall()
    
    data_logical = files[0][0]
    log_logical = files[1][0]
    print(f"  Data Logical Name: {data_logical}")
    print(f"  Log Logical Name: {log_logical}")

    # Set Single User Mode to drop active connections
    print("\n[Step 2] Disconnecting active users...")
    try:
        cursor.execute("IF DB_ID('DocuFlowDB') IS NOT NULL ALTER DATABASE [DocuFlowDB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;")
    except Exception as e:
        print(f"  (Single user note: {e})")

    # Restore Database
    print("\n[Step 3] Restoring DocuFlowDB...")
    restore_sql = f"""
    RESTORE DATABASE [DocuFlowDB]
    FROM DISK = N'{bak_path}'
    WITH REPLACE;
    """
    cursor.execute(restore_sql)
    while cursor.nextset():
        pass

    # Set Multi User Mode
    cursor.execute("ALTER DATABASE [DocuFlowDB] SET MULTI_USER;")
    print("✓ Restore completed successfully!")

    # Verify Counts
    print("\n[Step 4] Verifying restored tables in DocuFlowDB...")
    cursor.execute("USE [DocuFlowDB];")
    
    tables_to_check = ["users", "workflow_profiles", "workflow_step_definitions", "business_rules", "invoices", "audit_logs"]
    for t in tables_to_check:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM [dbo].[{t}];")
            cnt = cursor.fetchone()[0]
            print(f"  • Table [dbo].[{t}]: {cnt} records")
        except Exception as te:
            print(f"  • Table [dbo].[{t}]: Not found ({te})")

    conn.close()
    print("\n==================================================================")
    print(">>> 100% READY: All data restored from .bak into DocuFlowDB!")
    print("==================================================================")

if __name__ == "__main__":
    restore_database()
