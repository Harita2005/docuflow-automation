import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "DocuFlow Automation API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    
    # Database URL - Defaults to local SQLite, or configure MS SQL via .env
    # MS SQL Example: mssql+pyodbc://sa:password@localhost:1433/SmartDocLive?driver=ODBC+Driver+17+for+SQL+Server
    # Or pymssql: mssql+pymssql://sa:password@localhost:1433/SmartDocLive
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{BASE_DIR / 'docuflow.db'}"
    )
    
    # JWT Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-docuflow-jwt-key-2026-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Uploads
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    EXCEL_PATH: Path = BASE_DIR.parent / "SD SCHEMA AND WORKFLOW DETAILS.xlsx"

    class Config:
        case_sensitive = True
        extra = "ignore"
        env_file = ".env"

settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
