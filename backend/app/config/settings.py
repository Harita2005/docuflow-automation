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
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Database (Strictly Microsoft SQL Server at 192.168.179.22:1443)
    DB_HOST: str = "192.168.179.22"
    DB_PORT: int = 1443
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

    # Audit Log Retention (default 7 days / 1 week)
    AUDIT_LOG_RETENTION_DAYS: int = 7

    # SMTP Configuration (loaded from environment variables / .env)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_USERNAME: str = ""
    SMTP_PASS: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_SENDER_EMAIL: str = ""
    SMTP_SENDER_NAME: str = "DocuFlow Security"

    # SMS Gateway Configuration
    SMS_PROVIDER: str = "generic"
    SMS_API_URL: str = ""
    SMS_API_KEY: str = ""
    SMS_SENDER_ID: str = "DOCUFLOW"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    FAST2SMS_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -----------------------------------------------------------------------
    # Database URL
    # -----------------------------------------------------------------------

    def get_database_url(self) -> str:
        """
        Build the SQL Server connection URL from the configured settings.

        Enforces connection strictly to 192.168.179.22:1443 and eliminates any
        legacy localhost / 1433 / SQLite / MySQL / PostgreSQL configurations.
        """

        # Sanitize explicit database URL if provided
        if self.DATABASE_URL:
            db_url = self.DATABASE_URL.strip()
            forbidden = ["localhost", "127.0.0.1", ":1433", "@db:", "sqlite", "postgresql", "mysql"]
            if not any(f in db_url.lower() for f in forbidden):
                return db_url

        host = self.DB_HOST.strip() if self.DB_HOST else "192.168.179.22"
        if host.lower() in ("localhost", "127.0.0.1", "db"):
            host = "192.168.179.22"

        port = self.DB_PORT
        if port == 1433 or not port:
            port = 1443

        driver = quote_plus(self.DB_DRIVER)

        # SQL Server username/password authentication
        if self.DB_USER and self.DB_PASSWORD:
            username = quote_plus(self.DB_USER)
            password = quote_plus(self.DB_PASSWORD)

            return (
                f"mssql+pyodbc://{username}:{password}"
                f"@{host}:{port}/{self.DB_NAME}"
                f"?driver={driver}"
                f"&TrustServerCertificate="
                f"{'yes' if self.DB_TRUST_SERVER_CERTIFICATE else 'no'}"
            )

        # Windows / trusted connection
        return (
            f"mssql+pyodbc://@"
            f"{host}:{port}/{self.DB_NAME}"
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
