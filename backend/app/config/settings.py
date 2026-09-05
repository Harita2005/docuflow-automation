import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# BASE_DIR points to backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BASE_DIR.parent

# Load root .env file if available, otherwise backend/.env
env_path = ROOT_DIR / ".env"
if not env_path.exists():
    env_path = BASE_DIR / ".env"
load_dotenv(env_path)

class Settings(BaseSettings):
    PROJECT_NAME: str = "Strivh Professional Enterprises - Document Approval & Automation System - DAAS"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"

    # Database parameters
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "1433")
    DB_NAME: str = os.getenv("DB_NAME", "DocuFlowDB")
    DB_USER: str = os.getenv("DB_USER", "")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # JWT Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-docuflow-jwt-key-2026-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))

    # Uploads & Physical PDF Storage
    PDF_STORAGE_DIR: Path = Path(os.getenv("PDF_STORAGE_PATH", str(ROOT_DIR / "stored_pdfs")))
    APPROVED_PDF_DIR: Path = Path(os.getenv("APPROVED_PDF_PATH", str(ROOT_DIR / "stored_pdfs" / "approved")))
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    DATA_DIR: Path = BASE_DIR / "data"
    EXCEL_PATH: Path = BASE_DIR / "data" / "SD Checklists.xlsx"

    def get_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        if self.DB_USER and self.DB_PASSWORD:
            from urllib.parse import quote_plus
            safe_pass = quote_plus(self.DB_PASSWORD)
            return f"mssql+pyodbc://{self.DB_USER}:{safe_pass}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?driver=ODBC+Driver+17+for+SQL+Server&TrustServerCertificate=yes"
        elif self.DB_HOST:
            return f"mssql+pyodbc://@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?driver=ODBC+Driver+17+for+SQL+Server&trusted_connection=yes&TrustServerCertificate=yes"
        raise ValueError("Enterprise Configuration Error: DB_HOST or DATABASE_URL must be specified in environment settings (.env).")

    class Config:
        case_sensitive = True
        extra = "ignore"
        env_file = str(env_path)

settings = Settings()

# Ensure directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.APPROVED_PDF_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
