from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings, BASE_DIR

db_url = settings.DATABASE_URL

# Normalize Prisma-style sqlserver:// to standard SQLAlchemy URL or fallback
if db_url.startswith("sqlserver://"):
    # If not a standard SQLAlchemy connection string, default to SQLite or mssql+pyodbc
    db_url = f"sqlite:///{BASE_DIR / 'docuflow.db'}"

def ensure_mssql_database_exists(url_str: str):
    """Ensures the target MSSQL database exists by connecting to 'master' and creating it if needed."""
    try:
        if "/" in url_str:
            base_url, db_name = url_str.rsplit("/", 1)
            if "?" in db_name:
                db_name_only, query_str = db_name.split("?", 1)
                master_url = f"{base_url}/master?{query_str}"
            else:
                db_name_only = db_name
                master_url = f"{base_url}/master"
            
            from sqlalchemy import text
            temp_engine = create_engine(master_url, isolation_level="AUTOCOMMIT")
            with temp_engine.connect() as conn:
                conn.execute(text(f"IF DB_ID('{db_name_only}') IS NULL CREATE DATABASE [{db_name_only}];"))
            temp_engine.dispose()
            print(f"[Database] Ensured database [{db_name_only}] exists on SQL Server.")
    except Exception as e:
        print(f"[Database] Notice during database existence check: {e}")

engine_kwargs = {}
if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True

import time

if "mssql" in db_url:
    candidate_urls = [db_url]
    if "mssql+pyodbc" in db_url:
        base_clean = db_url.split("?")[0]
        pymssql_alt = base_clean.replace("mssql+pyodbc://", "mssql+pymssql://")
        candidate_urls.append(pymssql_alt)

    connected = False
    for target_url in candidate_urls:
        try:
            engine = create_engine(target_url, **engine_kwargs)
            with engine.connect() as conn:
                pass
            print(f"[Database] Successfully connected to MS SQL Server ({target_url.split('@')[-1]}).")
            connected = True
            break
        except Exception as err:
            print(f"[Database] Connect attempt failed for target ({target_url.split('@')[-1]}): {err}")

    if not connected:
        print(f"[Database Warning] Could not connect to MS SQL Server. Falling back to SQLite.")
        fallback_url = f"sqlite:///{BASE_DIR / 'docuflow.db'}"
        engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
else:
    try:
        engine = create_engine(db_url, **engine_kwargs)
        print(f"[Database] Successfully connected to DATABASE_URL: {db_url}")
    except Exception as e:
        print(f"[Database Warning] Could not connect to primary DATABASE_URL ({e}). Falling back to SQLite.")
        fallback_url = f"sqlite:///{BASE_DIR / 'docuflow.db'}"
        engine = create_engine(fallback_url, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
