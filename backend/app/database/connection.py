import time
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

db_url = settings.get_database_url()

# Normalize Prisma-style sqlserver:// to standard mssql+pyodbc SQLAlchemy URL
if db_url.startswith("sqlserver://"):
    db_url = db_url.replace("sqlserver://", "mssql+pyodbc://", 1)
    if "driver=" not in db_url.lower():
        delim = "&" if "?" in db_url else "?"
        db_url += f"{delim}driver=ODBC+Driver+17+for+SQL+Server&TrustServerCertificate=yes"

engine_kwargs = {
    "pool_size": 10,
    "max_overflow": 20,
    "pool_pre_ping": True,
    "pool_recycle": 300,
}

def ensure_mssql_database_exists(url: str):
    """Auto-create target database (e.g. DocuFlowDB) on MS SQL Server if missing."""
    if "mssql" not in url.lower():
        return
    db_name = settings.DB_NAME or "DocuFlowDB"
    if db_name.lower() == "master":
        return

    for attempt in range(5):
        try:
            from sqlalchemy import text
            from urllib.parse import quote_plus
            safe_pass = quote_plus(settings.DB_PASSWORD) if settings.DB_PASSWORD else ""
            user_part = f"{settings.DB_USER}:{safe_pass}@" if settings.DB_USER else ""
            master_url = f"mssql+pyodbc://{user_part}{settings.DB_HOST}:{settings.DB_PORT}/master?driver=ODBC+Driver+17+for+SQL+Server&TrustServerCertificate=yes"
            
            master_engine = create_engine(master_url, isolation_level="AUTOCOMMIT")
            with master_engine.connect() as conn:
                conn.execute(text(f"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'{db_name}') CREATE DATABASE [{db_name}];"))
            master_engine.dispose()
            print(f"[Database Auto-Create] Verified database '{db_name}' exists on SQL Server.")
            break
        except Exception as create_err:
            if attempt < 4:
                time.sleep(3)
            else:
                print(f"[Database Auto-Create Notice] Could not auto-create database '{db_name}': {create_err}")

# Auto-create database on master if missing
ensure_mssql_database_exists(db_url)

# Create SQL engine cleanly based on configured DATABASE_URL without fallback
try:
    engine = create_engine(db_url, **engine_kwargs)
    db_target = db_url.split("@")[-1] if "@" in db_url else db_url.split("://")[-1]
    print(f"[Database Connection] Successfully initialized engine for target: {db_target}")
except Exception as err:
    db_target = db_url.split("@")[-1] if "@" in db_url else db_url.split("://")[-1]
    print(f"[Database Error] Failed to initialize database engine for target: {err}")
    raise RuntimeError(f"Enterprise Database Connection Error: Failed to initialize engine. Details: {err}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        try:
            db.close()
        except Exception:
            try:
                db.invalidate()
            except Exception:
                # Explicitly handled fallback for optional feature
                pass
