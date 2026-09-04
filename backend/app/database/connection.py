import time
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings, BASE_DIR

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

# Create SQL engine cleanly based on configured DATABASE_URL without fallback
try:
    engine = create_engine(db_url, **engine_kwargs)
    db_target = db_url.split("@")[-1] if "@" in db_url else db_url
    print(f"[Database Connection] Successfully initialized engine for target: {db_target}")
except Exception as err:
    print(f"[Database Error] Failed to initialize database engine for {db_url}: {err}")
    raise RuntimeError(f"Enterprise Database Connection Error: Failed to initialize engine for {db_url}. Details: {err}")

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
                pass
