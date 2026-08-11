import pyodbc
import os
import shutil

def create_db_backup():
    public_bak = r"C:\Users\Public\DocuFlowDB.bak"
    repo_bak = os.path.abspath("DocuFlowDB.bak")
    
    print(f"1. Instructing MS SQL Server to write backup to: {public_bak}")
    
    conn = pyodbc.connect(
        "Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;",
        autocommit=True
    )
    cursor = conn.cursor()
    
    backup_sql = f"""
    BACKUP DATABASE [DocuFlowDB]
    TO DISK = N'{public_bak}'
    WITH FORMAT, INIT,
    NAME = N'DocuFlowDB-Full-Database-Backup',
    SKIP, NOREWIND, NOUNLOAD, STATS = 10;
    """
    
    cursor.execute(backup_sql)
    while cursor.nextset():
        pass
        
    print(f"2. Copying backup file to project repository: {repo_bak}")
    shutil.copyfile(public_bak, repo_bak)
    
    size_mb = round(os.path.getsize(repo_bak) / (1024*1024), 2)
    print(f"✓ Backup created and placed in repo successfully!")
    print(f"  Path: {repo_bak}")
    print(f"  Size: {size_mb} MB")
    
    conn.close()

if __name__ == "__main__":
    create_db_backup()
