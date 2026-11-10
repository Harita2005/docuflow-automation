from pathlib import Path
from app.config.settings import Settings

def test_sql_least_privilege_script_content():
    script_path = Path(__file__).resolve().parent.parent.parent / "scripts" / "sql" / "01_create_least_privilege_app_user.sql"
    assert script_path.exists(), "SQL least privilege script must exist"
    
    content = script_path.read_text(encoding="utf-8")
    assert "CREATE LOGIN [docuflow_app]" in content
    assert "db_datareader" in content
    assert "db_datawriter" in content
    assert "GRANT EXECUTE" in content
    assert "DENY ALTER ANY USER" in content
    assert "DENY ALTER ANY ROLE" in content

def test_dba_instructions_document_exists():
    doc_path = Path(__file__).resolve().parent.parent.parent / "docs" / "DATABASE_LEAST_PRIVILEGE_SETUP.md"
    assert doc_path.exists(), "DBA setup instructions document must exist"
    content = doc_path.read_text(encoding="utf-8")
    assert "docuflow_app" in content
    assert "db_datareader" in content
    assert "Rollback" in content

def test_settings_reads_db_credentials_from_env():
    settings = Settings(
        DATABASE_URL="",
        DB_USER="custom_app_user",
        DB_PASSWORD="custom_secure_password_123!",
        DB_HOST="192.168.179.22",
        DB_PORT=1443,
        DB_NAME="DocuFlowDB"
    )
    url = settings.get_database_url()
    assert "custom_app_user" in url
    assert "custom_secure_password_123%21" in url or "custom_secure_password_123!" in url
    assert "192.168.179.22" in url
    assert "DocuFlowDB" in url
