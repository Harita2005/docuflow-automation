from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings, BASE_DIR

db_url = settings.DATABASE_URL

# Normalize Prisma-style sqlserver:// to standard SQLAlchemy URL or fallback
if db_url.startswith("sqlserver://"):
    # If not a standard SQLAlchemy connection string, default to SQLite or mssql+pyodbc
    db_url = f"sqlite:///{BASE_DIR / 'docuflow.db'}"

engine_kwargs = {}
if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["pool_pre_ping"] = True

try:
    engine = create_engine(db_url, **engine_kwargs)
except Exception as e:
    print(f"[Database] Warning: Could not connect to primary DATABASE_URL ({e}). Falling back to SQLite.")
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
