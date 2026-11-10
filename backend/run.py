import os
import sys
import time
import logging
import uvicorn
from pathlib import Path
from app.config.settings import settings

BASE_DIR = Path(__file__).resolve().parent

def free_port_if_occupied(port: int = 3000):
    """Checks if the port is held by an orphan process and terminates it to prevent WinError 10013 / WSAEACCES."""
    if os.name != 'nt':
        return
    try:
        import subprocess
        output = subprocess.check_output(
            f'netstat -ano | findstr :{port}',
            shell=True,
            text=True,
            stderr=subprocess.DEVNULL
        )
        my_pid = os.getpid()
        for line in output.strip().splitlines():
            if 'LISTENING' in line:
                parts = line.strip().split()
                pid = int(parts[-1])
                if pid and pid != my_pid:
                    print(f"[DocuFlow Startup] Port {port} occupied by previous process PID {pid}. Releasing port...")
                    subprocess.run(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as exc:
        logging.getLogger("uvicorn.error").debug("Port occupancy check skipped: %s", exc)

def initialize_database():
    """Ensures database, tables, sequences, and core seed data exist on startup."""
    try:
        from app.database.connection import engine, Base, SessionLocal
        import app.database.models as models

        db_url = settings.get_database_url()
        print("[DocuFlow Startup] Verifying database connectivity...")

        # If connecting to SQL Server, ensure target database exists by connecting to master first if needed
        if "mssql" in db_url.lower():
            connected = False
            for attempt in range(1, 11):
                try:
                    with engine.connect() as conn:
                        connected = True
                        break
                except Exception as conn_err:
                    err_msg = str(conn_err)
                    if "Cannot open database" in err_msg or "does not exist" in err_msg:
                        try:
                            import pyodbc
                            host = settings.DB_HOST or "db"
                            port = settings.DB_PORT or 1433
                            user = settings.DB_USER or "sa"
                            pwd = settings.DB_PASSWORD or "Admin@1234"
                            driver = settings.DB_DRIVER or "ODBC Driver 18 for SQL Server"
                            master_conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE=master;UID={user};PWD={pwd};TrustServerCertificate=yes"
                            mconn = pyodbc.connect(master_conn_str, autocommit=True)
                            mcur = mconn.cursor()
                            mcur.execute(f"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'{settings.DB_NAME}') CREATE DATABASE [{settings.DB_NAME}];")
                            mconn.close()
                            print(f"[DocuFlow Startup] Database '{settings.DB_NAME}' created successfully.")
                            connected = True
                            break
                        except Exception as m_err:
                            print(f"[DocuFlow Startup] Attempt {attempt}/10: Waiting for SQL Server... ({m_err})")
                    else:
                        print(f"[DocuFlow Startup] Attempt {attempt}/10: Database not ready yet... ({conn_err})")
                    time.sleep(3)

            if not connected:
                print("[DocuFlow Startup] Notice: Database connection check bypassed; starting server.")

        # Create all tables defined in models
        Base.metadata.create_all(bind=engine)
        print("[DocuFlow Startup] Database schema verified/created.")

        # Ensure document_id_seq exists in SQL Server
        if "mssql" in db_url.lower():
            try:
                raw_conn = engine.raw_connection()
                try:
                    cursor = raw_conn.cursor()
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'document_id_seq')
                        BEGIN
                            CREATE SEQUENCE dbo.document_id_seq
                                AS BIGINT
                                START WITH 1
                                INCREMENT BY 1
                                MINVALUE 1
                                NO CYCLE
                                CACHE 10;
                        END
                    """)
                    raw_conn.commit()
                finally:
                    raw_conn.close()
            except Exception as seq_err:
                print(f"[DocuFlow Startup] Sequence check notice: {seq_err}")

        # Seed initial admin if users table is empty
        db = SessionLocal()
        try:
            user_count = db.query(models.User).count()
            if user_count == 0:
                print("[DocuFlow Startup] Empty user table detected. Seeding core administrator...")
                from app.auth import get_password_hash
                admin_user = models.User(
                    user_uid="USR-0001",
                    employee_id="EMP-0001",
                    employee_name="System Administrator",
                    username="admin",
                    email="admin@docuflow.internal",
                    name="System Administrator",
                    role="admin",
                    password_hash=get_password_hash("Admin@1234"),
                    is_active=True,
                    must_change_password=False
                )
                db.add(admin_user)
                db.commit()
                print("[DocuFlow Startup] Core administrator created (admin / Admin@1234).")
        finally:
            db.close()

    except Exception as e:
        print(f"[DocuFlow Startup] Database auto-initialization notice: {e}")

if __name__ == '__main__':
    free_port_if_occupied(3000)
    initialize_database()

    env = (settings.ENVIRONMENT or os.getenv("ENVIRONMENT", "development")).strip().lower()
    is_non_prod = env in ("development", "dev", "local", "test", "testing")

    explicit_reload = os.getenv("UVICORN_RELOAD")
    if explicit_reload is not None:
        reload_enabled = explicit_reload.strip().lower() in ("1", "true", "yes")
    else:
        reload_enabled = is_non_prod

    uvicorn_kwargs = {
        "host": "0.0.0.0",
        "port": 3000,
        "reload": reload_enabled,
    }
    if reload_enabled:
        uvicorn_kwargs["reload_dirs"] = [str(BASE_DIR / "app")]
        uvicorn_kwargs["reload_includes"] = ["*.py"]
        uvicorn_kwargs["reload_excludes"] = ["*.pyc", "__pycache__", "*.db", "uploads/*"]

    uvicorn.run("app.main:app", **uvicorn_kwargs)
