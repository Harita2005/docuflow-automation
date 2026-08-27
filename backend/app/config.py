import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))  # 30 minutes expiry
    
    # Uploads & Physical PDF Storage inside project folder (Stores ONLY Approved Documents)
    PDF_STORAGE_DIR: Path = Path(os.getenv("PDF_STORAGE_PATH", str(BASE_DIR.parent / "stored_pdfs")))
    APPROVED_PDF_DIR: Path = Path(os.getenv("APPROVED_PDF_PATH", str(BASE_DIR.parent / "stored_pdfs" / "approved")))
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    EXCEL_PATH: Path = BASE_DIR.parent / "SD SCHEMA AND WORKFLOW DETAILS.xlsx"

    class Config:
        case_sensitive = True
        extra = "ignore"
        env_file = ".env"

settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.APPROVED_PDF_DIR.mkdir(parents=True, exist_ok=True)
