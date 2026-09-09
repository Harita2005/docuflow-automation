from pathlib import Path
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BASE_DIR.parent

ENV_FILE = ROOT_DIR / ".env"
if not ENV_FILE.exists():
    ENV_FILE = BASE_DIR / ".env"


# ---------------------------------------------------------------------------
# Application settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    # Application
    PROJECT_NAME: str = (
        "Strivh Professional Enterprises - "
        "Document Approval & Automation System - DAAS"
    )
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 1433
    DB_NAME: str = "DocuFlowDB"
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DATABASE_URL: str = ""

    # SQL Server
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"
    DB_TRUST_SERVER_CERTIFICATE: bool = True

    # Authentication
    SECRET_KEY: str = ""
    SERVICE_API_KEY: str = "DocuFlow-M2M-Integration-Secret-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200

    # Storage
    PDF_STORAGE_DIR: Path = ROOT_DIR / "stored_pdfs"
    APPROVED_PDF_DIR: Path = ROOT_DIR / "stored_pdfs" / "approved"
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    DATA_DIR: Path = BASE_DIR / "data"
    EXCEL_PATH: Path = BASE_DIR / "data" / "SD Checklists.xlsx"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # -----------------------------------------------------------------------
    # Database URL
    # -----------------------------------------------------------------------

    def get_database_url(self) -> str:
        """
        Build the SQL Server connection URL from the configured settings.

        If DATABASE_URL is explicitly provided in .env, it is used directly.
        Otherwise, the URL is built from DB_HOST, DB_PORT, DB_NAME,
        DB_USER, DB_PASSWORD, and SQL Server driver settings.
        """

        # Explicit database URL takes priority.
        if self.DATABASE_URL:
            return self.DATABASE_URL

        driver = quote_plus(self.DB_DRIVER)

        # SQL Server username/password authentication
        if self.DB_USER and self.DB_PASSWORD:
            username = quote_plus(self.DB_USER)
            password = quote_plus(self.DB_PASSWORD)

            return (
                f"mssql+pyodbc://{username}:{password}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
                f"?driver={driver}"
                f"&TrustServerCertificate="
                f"{'yes' if self.DB_TRUST_SERVER_CERTIFICATE else 'no'}"
            )

        # Windows / trusted connection
        return (
            f"mssql+pyodbc://@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?driver={driver}"
            f"&trusted_connection=yes"
            f"&TrustServerCertificate="
            f"{'yes' if self.DB_TRUST_SERVER_CERTIFICATE else 'no'}"
        )


# ---------------------------------------------------------------------------
# Global settings instance
# ---------------------------------------------------------------------------

settings = Settings()


# ---------------------------------------------------------------------------
# Required directories
# ---------------------------------------------------------------------------

settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.APPROVED_PDF_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "settings",
    "BASE_DIR",
    "ROOT_DIR",
    "Settings",
]
