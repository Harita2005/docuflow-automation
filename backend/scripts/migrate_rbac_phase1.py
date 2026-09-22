import os
import sys
import logging
from sqlalchemy import create_engine, inspect, text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config.settings import settings

def run_migration():
    db_url = settings.get_database_url()
    logger.info("Connecting to database for RBAC Phase 1 migration...")
    engine = create_engine(db_url)
    inspector = inspect(engine)

    # 1. Check permissions table
    if "permissions" not in inspector.get_table_names():
        logger.error("Table 'permissions' does not exist.")
        return False
    
    perm_cols = {col["name"] for col in inspector.get_columns("permissions")}
    
    with engine.begin() as conn:
        # Add subpage
        if "subpage" not in perm_cols:
            logger.info("Adding column 'subpage' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD subpage VARCHAR(50) NULL;"))
        else:
            logger.info("Column 'subpage' already exists in permissions.")

        # Add supported_scopes
        if "supported_scopes" not in perm_cols:
            logger.info("Adding column 'supported_scopes' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD supported_scopes VARCHAR(100) NULL;"))
        else:
            logger.info("Column 'supported_scopes' already exists in permissions.")

        # Add legacy_code
        if "legacy_code" not in perm_cols:
            logger.info("Adding column 'legacy_code' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD legacy_code VARCHAR(100) NULL;"))
        else:
            logger.info("Column 'legacy_code' already exists in permissions.")

        # Add index on legacy_code if not exists
        conn.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_permissions_legacy_code' AND object_id = OBJECT_ID('permissions'))
            BEGIN
                CREATE NONCLUSTERED INDEX ix_permissions_legacy_code ON permissions(legacy_code);
            END
        """))

        # Add index on subpage if not exists
        conn.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_permissions_subpage' AND object_id = OBJECT_ID('permissions'))
            BEGIN
                CREATE NONCLUSTERED INDEX ix_permissions_subpage ON permissions(subpage);
            END
        """))

        # 2. Check role_permissions table
        role_perm_cols = {col["name"] for col in inspector.get_columns("role_permissions")}
        if "scope" not in role_perm_cols:
            logger.info("Adding column 'scope' to role_permissions table with default 'ALL'...")
            conn.execute(text("""
                ALTER TABLE role_permissions ADD scope VARCHAR(50) NOT NULL CONSTRAINT DF_role_permissions_scope DEFAULT 'ALL';
            """))
        else:
            logger.info("Column 'scope' already exists in role_permissions.")

        # Backfill existing role_permissions scope
        conn.execute(text("UPDATE role_permissions SET scope = 'ALL' WHERE scope IS NULL OR scope = '';"))

        # 3. Update existing 14 permissions with metadata and legacy_code = code
        legacy_mappings = [
            ("doc:read", "detail", "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL"),
            ("doc:create", "upload", "DIVISION,ALL"),
            ("doc:approve", "detail", "ASSIGNED,ALL"),
            ("doc:reject", "detail", "ASSIGNED,ALL"),
            ("doc:cancel", "detail", "OWN,ALL"),
            ("doc:move_prev", "detail", "ASSIGNED,ALL"),
            ("doc:download", "detail", "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL"),
            ("workflow:read", "routing", "ALL"),
            ("workflow:write", "routing", "ALL"),
            ("condition:read", "matrix", "ALL"),
            ("condition:write", "matrix", "ALL"),
            ("user:manage", "users", "DEPARTMENT,DIVISION,ALL"),
            ("audit:read", "audit", "DEPARTMENT,DIVISION,ALL"),
            ("sync:execute", "sync", "ALL"),
        ]

        for code, subpage, scopes in legacy_mappings:
            conn.execute(
                text("""
                    UPDATE permissions 
                    SET legacy_code = :code, 
                        subpage = COALESCE(subpage, :subpage), 
                        supported_scopes = COALESCE(supported_scopes, :scopes)
                    WHERE code = :code
                """),
                {"code": code, "subpage": subpage, "scopes": scopes}
            )

    logger.info("RBAC Phase 1 database migration completed successfully!")
    return True

if __name__ == "__main__":
    success = run_migration()
    if not success:
        sys.exit(1)
