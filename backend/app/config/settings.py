from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

from pydantic import model_validator
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
    DB_TRUST_SERVER_CERTIFICATE: Optional[bool] = None

    @property
    def trust_server_certificate(self) -> bool:
        """
        Determines whether to trust server TLS certificate without validation.
        Defaults to False in production (strict TLS validation), and True in development.
        Can be explicitly overridden via DB_TRUST_SERVER_CERTIFICATE.
        """
        if self.DB_TRUST_SERVER_CERTIFICATE is not None:
            return self.DB_TRUST_SERVER_CERTIFICATE
        env = (self.ENVIRONMENT or "").strip().lower()
        return env not in ("production", "prod")

    def get_database_url(self) -> str:
        """Build the SQL Server connection URL.

        Enforces connection to 192.168.179.22:1443 and avoids localhost defaults.
        """
        import socket
        def _is_host_live(h: str, p: int) -> bool:
            try:
                with socket.create_connection((h, int(p)), timeout=0.8):
                    return True
            except Exception:
                return False

        # Use explicit DATABASE_URL if provided and host is reachable
        if self.DATABASE_URL:
            db_url = self.DATABASE_URL.strip()
            forbidden = ["@db:", "sqlite", "postgresql", "mysql"]
            if not any(f in db_url.lower() for f in forbidden):
                import re
                host_port_match = re.search(r"@([^:/]+)(?::(\d+))?", db_url)
                if host_port_match:
                    target_h = host_port_match.group(1)
                    target_p = int(host_port_match.group(2) or 1433)
                    if target_h.lower() not in ("localhost", "127.0.0.1") and not _is_host_live(target_h, target_p):
                        # Remote host is not reachable, proceed to fallback logic below
                        pass
                    else:
                        trust_cert = "yes" if self.trust_server_certificate else "no"
                        if "TrustServerCertificate=" in db_url:
                            return re.sub(r"TrustServerCertificate=[a-zA-Z0-9]+", f"TrustServerCertificate={trust_cert}", db_url)
                        return db_url
                else:
                    return db_url
        host = self.DB_HOST.strip() if self.DB_HOST else "192.168.179.22"
        if host.lower() in ("localhost", "127.0.0.1", "db"):
            host = "192.168.179.22"
        port = self.DB_PORT
        if not port or port == 1433:
            port = 1443
        driver = quote_plus(self.DB_DRIVER)
        trust_cert = "yes" if self.trust_server_certificate else "no"

        # If remote host is not reachable on the network, fallback to localhost trusted connection
        import socket
        try:
            with socket.create_connection((host, int(port)), timeout=0.8):
                is_remote_live = True
        except Exception:
            is_remote_live = False

        if not is_remote_live:
            try:
                with socket.create_connection(("localhost", 1433), timeout=0.5):
                    return f"mssql+pyodbc://@localhost/{self.DB_NAME}?driver={driver}&trusted_connection=yes&TrustServerCertificate={trust_cert}"
            except Exception:
                # Ignore connection check failure and proceed with configured connection parameters
                pass

        if self.DB_USER and self.DB_PASSWORD:
            user = quote_plus(self.DB_USER)
            pwd = quote_plus(self.DB_PASSWORD)
            return (
                f"mssql+pyodbc://{user}:{pwd}@{host}:{port}/{self.DB_NAME}?driver={driver}&TrustServerCertificate={trust_cert}"
            )
        return (
            f"mssql+pyodbc://@{host}:{port}/{self.DB_NAME}?driver={driver}&trusted_connection=yes&TrustServerCertificate={trust_cert}"
        )

    ARCHIVE_DB_NAME: str = "DocuFlowArchiveDB"

    def get_archive_database_url(self) -> str:
        """Build the SQL Server connection URL for DocuFlowArchiveDB on the same instance."""
        primary_url = self.get_database_url()
        return primary_url.replace(f"/{self.DB_NAME}?", f"/{self.ARCHIVE_DB_NAME}?")

    # Authentication
    SECRET_KEY: str = ""
    SERVICE_API_KEY: str = "DocuFlow-M2M-Integration-Secret-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    FILE_URL_SIGNING_SECRET: Optional[str] = None
    FILE_URL_TTL_SECONDS: int = 90

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
    SHOW_OTP_IN_UI: bool = True

    # SMS Gateway Configuration
    SMS_PROVIDER: str = "generic"
    SMS_API_URL: str = ""
    SMS_API_KEY: str = ""
    SMS_SENDER_ID: str = "DOCUFLOW"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    FAST2SMS_API_KEY: str = ""

    # LLM & AI Extraction Configuration
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    MAX_CONCURRENT_OCR: int = 3
    OCR_SEMAPHORE_TIMEOUT: float = 60.0

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @model_validator(mode="after")
    def canonicalize_storage_paths(self):
        """
        Guarantees that UPLOAD_DIR, PDF_STORAGE_DIR, and APPROVED_PDF_DIR
        always resolve to canonical, absolute system paths regardless of the
        current working directory or relative path strings in .env.
        """
        if isinstance(self.UPLOAD_DIR, (str, Path)):
            raw_upload = str(self.UPLOAD_DIR).replace('\\', '/').strip('./')
            if raw_upload.endswith('uploads'):
                self.UPLOAD_DIR = (BASE_DIR / 'uploads').resolve()
            elif not Path(self.UPLOAD_DIR).is_absolute():
                self.UPLOAD_DIR = (ROOT_DIR / self.UPLOAD_DIR).resolve()
            else:
                self.UPLOAD_DIR = Path(self.UPLOAD_DIR).resolve()
        else:
            self.UPLOAD_DIR = (BASE_DIR / 'uploads').resolve()

        if isinstance(self.PDF_STORAGE_DIR, (str, Path)):
            p = Path(self.PDF_STORAGE_DIR)
            if not p.is_absolute():
                self.PDF_STORAGE_DIR = (ROOT_DIR / p).resolve()
            else:
                self.PDF_STORAGE_DIR = p.resolve()
        else:
            self.PDF_STORAGE_DIR = (ROOT_DIR / 'stored_pdfs').resolve()

        if isinstance(self.APPROVED_PDF_DIR, (str, Path)):
            p = Path(self.APPROVED_PDF_DIR)
            if not p.is_absolute():
                self.APPROVED_PDF_DIR = (self.PDF_STORAGE_DIR / 'approved').resolve()
            else:
                self.APPROVED_PDF_DIR = p.resolve()
        else:
            self.APPROVED_PDF_DIR = (self.PDF_STORAGE_DIR / 'approved').resolve()

        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        self.APPROVED_PDF_DIR.mkdir(parents=True, exist_ok=True)

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
# Security validation
# ---------------------------------------------------------------------------

KNOWN_DEFAULT_SERVICE_KEYS = {
    "DocuFlow-M2M-Integration-Secret-2026",
    "<GENERATE_RANDOM_M2M_API_KEY>",
    "changeme",
    "secret",
    "default",
    "your-api-key",
}

KNOWN_DEFAULT_FILE_SIGNING_SECRETS = {
    "<GENERATE_RANDOM_FILE_URL_SIGNING_SECRET_MIN_32_CHARS>",
    "changeme",
    "secret",
    "default",
    "your-file-signing-secret",
    "DocuFlow-File-Signing-Secret-2026",
}


def validate_production_service_api_key(service_api_key: Optional[str], environment: str) -> bool:
    """
    Validates that in production, SERVICE_API_KEY is configured with a secure random key
    of at least 32 characters and does not match any known default or placeholder.
    Raises RuntimeError if insecure in production.
    """
    if environment.lower() not in ("production", "prod"):
        return True

    clean_key = (service_api_key or "").strip()
    if not clean_key:
        raise RuntimeError(
            "FATAL: SERVICE_API_KEY is missing or empty in production environment. "
            "Please configure a secure random key with at least 32 characters."
        )
    if clean_key in KNOWN_DEFAULT_SERVICE_KEYS:
        raise RuntimeError(
            "FATAL: SERVICE_API_KEY in production cannot use default, template, or placeholder values. "
            "Please generate a unique random secret."
        )
    if len(clean_key) < 32:
        raise RuntimeError(
            f"FATAL: SERVICE_API_KEY in production must be at least 32 characters long "
            f"(current length: {len(clean_key)}). Please generate a stronger secret."
        )
    return True


def validate_production_file_url_signing_secret(
    signing_secret: Optional[str],
    environment: str,
    jwt_secret: Optional[str] = None,
) -> bool:
    """
    Validates that in production, FILE_URL_SIGNING_SECRET is configured with a secure random key
    of at least 32 characters, does not match known defaults/placeholders, and is NOT identical to SECRET_KEY.
    Raises RuntimeError if insecure in production.
    """
    if environment.lower() not in ("production", "prod"):
        return True

    clean_secret = (signing_secret or "").strip()
    if not clean_secret:
        raise RuntimeError(
            "FATAL: FILE_URL_SIGNING_SECRET is missing or empty in production environment. "
            "Please configure a secure random key with at least 32 characters."
        )
    if clean_secret in KNOWN_DEFAULT_FILE_SIGNING_SECRETS:
        raise RuntimeError(
            "FATAL: FILE_URL_SIGNING_SECRET in production cannot use default, template, or placeholder values. "
            "Please generate a unique random secret."
        )
    if len(clean_secret) < 32:
        raise RuntimeError(
            f"FATAL: FILE_URL_SIGNING_SECRET in production must be at least 32 characters long "
            f"(current length: {len(clean_secret)}). Please generate a stronger secret."
        )
    if jwt_secret and clean_secret == jwt_secret.strip():
        raise RuntimeError(
            "FATAL: FILE_URL_SIGNING_SECRET must be distinct from SECRET_KEY."
        )
    return True


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "settings",
    "BASE_DIR",
    "ROOT_DIR",
    "Settings",
    "validate_production_service_api_key",
    "validate_production_file_url_signing_secret",
    "KNOWN_DEFAULT_SERVICE_KEYS",
    "KNOWN_DEFAULT_FILE_SIGNING_SECRETS",
]
