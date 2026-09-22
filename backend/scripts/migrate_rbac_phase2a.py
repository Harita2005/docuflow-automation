import os
import sys
import logging
import datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config.settings import settings
from app.database.models import Permission, Role, RolePermission

APPROVED_20_PERMISSIONS = [
    # 1. DOCUMENT OPERATIONS (10)
    {
        "code": "doc:view",
        "name": "View Documents",
        "description": "Inspect document metadata, OCR fields, and attached PDFs",
        "module": "DOC",
        "subpage": "detail",
        "action": "VIEW",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": "doc:read",
    },
    {
        "code": "doc:edit",
        "name": "Review / Edit Documents",
        "description": "Review, correct OCR extraction, and edit invoice & PO metadata",
        "module": "DOC",
        "subpage": "detail",
        "action": "EDIT",
        "supported_scopes": "ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": "doc:read",
    },
    {
        "code": "doc:approve",
        "name": "Approve Documents",
        "description": "Sign off workflow approval stages (stage approver verification enforced)",
        "module": "DOC",
        "subpage": "detail",
        "action": "APPROVE",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:approve",
    },
    {
        "code": "doc:reject",
        "name": "Reject Documents",
        "description": "Formally reject document stages with audit remarks",
        "module": "DOC",
        "subpage": "detail",
        "action": "REJECT",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:reject",
    },
    {
        "code": "doc:hold",
        "name": "Hold Documents",
        "description": "Place documents on hold pending clarification or documentation",
        "module": "DOC",
        "subpage": "detail",
        "action": "HOLD",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:cancel",
    },
    {
        "code": "doc:sendback",
        "name": "Return / Send Back Documents",
        "description": "Return documents to previous workflow approval stage for correction",
        "module": "DOC",
        "subpage": "detail",
        "action": "SENDBACK",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:move_prev",
    },
    {
        "code": "doc:assign",
        "name": "Assign / Delegate Documents",
        "description": "Reassign or delegate approval tasks to peers within department or division",
        "module": "DOC",
        "subpage": "detail",
        "action": "ASSIGN",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:download",
        "name": "Download Documents (PDF)",
        "description": "Download original and signed/watermarked document PDF files",
        "module": "DOC",
        "subpage": "detail",
        "action": "DOWNLOAD",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": "doc:download",
    },
    {
        "code": "doc:work_tracker",
        "name": "View Work Tracker",
        "description": "Access active work queues, task deadlines, and SLA timers",
        "module": "DOC",
        "subpage": "work_tracker",
        "action": "VIEW",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:approved_view",
        "name": "View Approved Documents",
        "description": "Access historical repository of settled and approved documents",
        "module": "DOC",
        "subpage": "approved_docs",
        "action": "VIEW",
        "supported_scopes": "OWN,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },

    # 2. ADMINISTRATION (3)
    {
        "code": "admin:users",
        "name": "Manage Users",
        "description": "Register employees, update department/division, reset passwords, deactivate accounts",
        "module": "ADMIN",
        "subpage": "users",
        "action": "MANAGE",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": "user:manage",
    },
    {
        "code": "admin:rbac",
        "name": "Manage Roles & Permissions",
        "description": "Configure roles, permission assignments, FLAC matrix, and custom permissions",
        "module": "ADMIN",
        "subpage": "rbac",
        "action": "MANAGE",
        "supported_scopes": "ALL",
        "legacy_code": "role:manage",
    },
    {
        "code": "admin:audit",
        "name": "View Audit Logs",
        "description": "Inspect immutable system audit trail, signoffs, and security event logs",
        "module": "ADMIN",
        "subpage": "audit",
        "action": "VIEW",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": "audit:read",
    },

    # 3. CONFIGURATION - ADMIN ONLY (6)
    {
        "code": "doc:upload",
        "name": "Upload Documents",
        "description": "Upload documents, batch OCR ingestion, and intake processing",
        "module": "DOC",
        "subpage": "upload",
        "action": "CREATE",
        "supported_scopes": "ALL,DIVISION",
        "legacy_code": "doc:create",
    },
    {
        "code": "workflow:manage",
        "name": "Manage Workflows",
        "description": "Create and modify workflow approval routes, stages, and step profiles",
        "module": "WORKFLOW",
        "subpage": "routing",
        "action": "MANAGE",
        "supported_scopes": "ALL",
        "legacy_code": "workflow:write",
    },
    {
        "code": "workflow:rules",
        "name": "Manage Routing Rules",
        "description": "Configure conditional AND/OR routing rules and policy matrices",
        "module": "WORKFLOW",
        "subpage": "matrix",
        "action": "MANAGE",
        "supported_scopes": "ALL",
        "legacy_code": "condition:write",
    },
    {
        "code": "workflow:checklists",
        "name": "Manage Checklists",
        "description": "Define compliance verification questions and checklists per stage",
        "module": "WORKFLOW",
        "subpage": "checklists",
        "action": "MANAGE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:system",
        "name": "Manage System & Notifications",
        "description": "Configure ERP masters, system settings, database backups, and RACI matrices",
        "module": "ADMIN",
        "subpage": "system",
        "action": "MANAGE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:manage",
        "name": "Manage Integrations & Sync",
        "description": "Manage 3rd-party webhook apps, callback rules, and ERP/DAPI data sync",
        "module": "INTEGRATION",
        "subpage": "sync",
        "action": "MANAGE",
        "supported_scopes": "ALL",
        "legacy_code": "sync:execute",
    },

    # 4. EXPORT & REPORTING (1)
    {
        "code": "report:export",
        "name": "Export Reports & Data",
        "description": "Download bulk CSV/Excel exports across queues and audit logs",
        "module": "REPORT",
        "subpage": "work_tracker",
        "action": "EXPORT",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
]

def run_migration_phase2a():
    db_url = settings.get_database_url()
    logger.info("Starting RBAC Phase 2A database migration...")
    engine = create_engine(db_url)
    inspector = inspect(engine)

    if "permissions" not in inspector.get_table_names():
        logger.error("Table 'permissions' does not exist.")
        return False

    perm_cols = {col["name"] for col in inspector.get_columns("permissions")}

    with engine.begin() as conn:
        # 1. Add description
        if "description" not in perm_cols:
            logger.info("Adding column 'description' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD description VARCHAR(255) NULL;"))
        else:
            logger.info("Column 'description' already exists.")

        # 2. Add is_custom
        if "is_custom" not in perm_cols:
            logger.info("Adding column 'is_custom' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD is_custom BIT NOT NULL CONSTRAINT DF_permissions_is_custom DEFAULT 0;"))
        else:
            logger.info("Column 'is_custom' already exists.")

        # 3. Add is_active
        if "is_active" not in perm_cols:
            logger.info("Adding column 'is_active' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD is_active BIT NOT NULL CONSTRAINT DF_permissions_is_active DEFAULT 1;"))
        else:
            logger.info("Column 'is_active' already exists.")

        # 4. Add created_by
        if "created_by" not in perm_cols:
            logger.info("Adding column 'created_by' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD created_by VARCHAR(150) NULL CONSTRAINT DF_permissions_created_by DEFAULT 'System';"))
        else:
            logger.info("Column 'created_by' already exists.")

        # 5. Add updated_at
        if "updated_at" not in perm_cols:
            logger.info("Adding column 'updated_at' to permissions table...")
            conn.execute(text("ALTER TABLE permissions ADD updated_at DATETIME NULL;"))
        else:
            logger.info("Column 'updated_at' already exists.")

        # Ensure index on is_custom and is_active
        conn.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_permissions_is_custom' AND object_id = OBJECT_ID('permissions'))
            BEGIN
                CREATE NONCLUSTERED INDEX ix_permissions_is_custom ON permissions(is_custom);
            END
        """))
        conn.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_permissions_is_active' AND object_id = OBJECT_ID('permissions'))
            BEGIN
                CREATE NONCLUSTERED INDEX ix_permissions_is_active ON permissions(is_active);
            END
        """))

    # 6. Synchronize approved 20 canonical permissions using Session
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        now = datetime.datetime.utcnow()

        # Update existing records to ensure is_active=True and is_custom=False
        db.query(Permission).update({
            Permission.is_active: True,
            Permission.is_custom: False,
        })
        db.commit()

        # Seed or update the 20 approved canonical permissions
        created_count = 0
        updated_count = 0
        for item in APPROVED_20_PERMISSIONS:
            existing = db.query(Permission).filter(Permission.code == item["code"]).first()
            if existing:
                existing.name = item["name"]
                existing.description = item["description"]
                existing.module = item["module"]
                existing.subpage = item["subpage"]
                existing.action = item["action"]
                existing.supported_scopes = item["supported_scopes"]
                existing.is_custom = False
                existing.is_active = True
                if item["legacy_code"]:
                    existing.legacy_code = item["legacy_code"]
                existing.updated_at = now
                updated_count += 1
            else:
                new_perm = Permission(
                    code=item["code"],
                    name=item["name"],
                    description=item["description"],
                    module=item["module"],
                    subpage=item["subpage"],
                    action=item["action"],
                    supported_scopes=item["supported_scopes"],
                    legacy_code=item["legacy_code"],
                    is_custom=False,
                    is_active=True,
                    created_by="System",
                    created_at=now,
                    updated_at=now,
                )
                db.add(new_perm)
                created_count += 1
        db.commit()
        logger.info(f"Approved 20 canonical permissions synchronized: {created_count} created, {updated_count} updated.")

        # Ensure admin role has all 20 permissions assigned with scope='ALL'
        admin_role = db.query(Role).filter(Role.code.ilike("admin")).first()
        if admin_role:
            assigned_count = 0
            for item in APPROVED_20_PERMISSIONS:
                p = db.query(Permission).filter(Permission.code == item["code"]).first()
                if p:
                    rp = db.query(RolePermission).filter(
                        RolePermission.role_id == admin_role.id,
                        RolePermission.permission_id == p.id
                    ).first()
                    if not rp:
                        db.add(RolePermission(role_id=admin_role.id, permission_id=p.id, scope="ALL"))
                        assigned_count += 1
                    else:
                        if not rp.scope:
                            rp.scope = "ALL"
            db.commit()
            logger.info(f"Assigned {assigned_count} new permissions to role '{admin_role.code}' with scope='ALL'.")

        total_perms = db.query(Permission).count()
        logger.info(f"Total permissions in DB: {total_perms}.")
        return True

    except Exception as e:
        db.rollback()
        logger.error(f"Migration Phase 2A failed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    success = run_migration_phase2a()
    if not success:
        sys.exit(1)
