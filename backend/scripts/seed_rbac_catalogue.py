import os
import sys
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config.settings import settings
from app.database.models import Permission, Role, RolePermission

CATALOGUE = [
    # --- 1. OPERATIONS (doc) ---
    {
        "code": "doc:dashboard:view",
        "name": "View Operations Dashboard",
        "module": "doc",
        "subpage": "dashboard",
        "action": "VIEW",
        "supported_scopes": "OWN,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:dashboard:export",
        "name": "Export Dashboard Metrics",
        "module": "doc",
        "subpage": "dashboard",
        "action": "EXPORT",
        "supported_scopes": "OWN,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:work_tracker:view",
        "name": "View Work Tracker Queue",
        "module": "doc",
        "subpage": "work_tracker",
        "action": "VIEW",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:work_tracker:export",
        "name": "Export Work Tracker Tasks",
        "module": "doc",
        "subpage": "work_tracker",
        "action": "EXPORT",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:approved_docs:view",
        "name": "View Approved Documents",
        "module": "doc",
        "subpage": "approved_docs",
        "action": "VIEW",
        "supported_scopes": "OWN,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:approved_docs:download",
        "name": "Download Approved Documents",
        "module": "doc",
        "subpage": "approved_docs",
        "action": "DOWNLOAD",
        "supported_scopes": "OWN,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:approved_docs:export",
        "name": "Export Approved Documents",
        "module": "doc",
        "subpage": "approved_docs",
        "action": "EXPORT",
        "supported_scopes": "OWN,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:upload:view",
        "name": "Access Upload & Ingest Desk",
        "module": "doc",
        "subpage": "upload",
        "action": "VIEW",
        "supported_scopes": "DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:upload:create",
        "name": "Upload & Ingest Documents",
        "module": "doc",
        "subpage": "upload",
        "action": "CREATE",
        "supported_scopes": "DIVISION,ALL",
        "legacy_code": "doc:create",
    },
    {
        "code": "doc:verification:view",
        "name": "Access OCR Verification Desk",
        "module": "doc",
        "subpage": "verification",
        "action": "VIEW",
        "supported_scopes": "ASSIGNED,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:verification:edit",
        "name": "Override OCR Extracted Fields",
        "module": "doc",
        "subpage": "verification",
        "action": "EDIT",
        "supported_scopes": "ASSIGNED,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:verification:confirm",
        "name": "Confirm OCR Extracted Data",
        "module": "doc",
        "subpage": "verification",
        "action": "CONFIRM",
        "supported_scopes": "ASSIGNED,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:detail:view",
        "name": "Inspect Document Details & PDF",
        "module": "doc",
        "subpage": "detail",
        "action": "VIEW",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": "doc:read",
    },
    {
        "code": "doc:detail:edit",
        "name": "Modify Document & PO Metadata",
        "module": "doc",
        "subpage": "detail",
        "action": "EDIT",
        "supported_scopes": "ASSIGNED,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:detail:approve",
        "name": "Approve Document Stage",
        "module": "doc",
        "subpage": "detail",
        "action": "APPROVE",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:approve",
    },
    {
        "code": "doc:detail:reject",
        "name": "Reject Document Stage",
        "module": "doc",
        "subpage": "detail",
        "action": "REJECT",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:reject",
    },
    {
        "code": "doc:detail:send_back",
        "name": "Return Document to Previous Stage",
        "module": "doc",
        "subpage": "detail",
        "action": "SEND_BACK",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": "doc:move_prev",
    },
    {
        "code": "doc:detail:hold",
        "name": "Place Document on Hold",
        "module": "doc",
        "subpage": "detail",
        "action": "HOLD",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:detail:cancel",
        "name": "Cancel / Void Document",
        "module": "doc",
        "subpage": "detail",
        "action": "CANCEL",
        "supported_scopes": "OWN,ALL",
        "legacy_code": "doc:cancel",
    },
    {
        "code": "doc:detail:download",
        "name": "Download Original & Compressed PDF",
        "module": "doc",
        "subpage": "detail",
        "action": "DOWNLOAD",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": "doc:download",
    },
    {
        "code": "doc:detail:comment",
        "name": "Post Discussion & Audit Comments",
        "module": "doc",
        "subpage": "detail",
        "action": "COMMENT",
        "supported_scopes": "OWN,ASSIGNED,DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "doc:detail:assign",
        "name": "Reassign or Delegate Approver",
        "module": "doc",
        "subpage": "detail",
        "action": "ASSIGN",
        "supported_scopes": "ASSIGNED,ALL",
        "legacy_code": None,
    },

    # --- 2. WORKFLOW (workflow) ---
    {
        "code": "workflow:routing:view",
        "name": "View Workflow Routing Schemes",
        "module": "workflow",
        "subpage": "routing",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": "workflow:read",
    },
    {
        "code": "workflow:routing:create",
        "name": "Create Workflow Profiles & Steps",
        "module": "workflow",
        "subpage": "routing",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": "workflow:write",
    },
    {
        "code": "workflow:routing:edit",
        "name": "Modify Workflow Profiles & Steps",
        "module": "workflow",
        "subpage": "routing",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": "workflow:write",
    },
    {
        "code": "workflow:routing:delete",
        "name": "Delete Workflow Profiles & Steps",
        "module": "workflow",
        "subpage": "routing",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": "workflow:write",
    },
    {
        "code": "workflow:matrix:view",
        "name": "View Condition Policy Rules",
        "module": "workflow",
        "subpage": "matrix",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": "condition:read",
    },
    {
        "code": "workflow:matrix:create",
        "name": "Create Routing Condition Rules",
        "module": "workflow",
        "subpage": "matrix",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": "condition:write",
    },
    {
        "code": "workflow:matrix:edit",
        "name": "Modify Routing Condition Rules",
        "module": "workflow",
        "subpage": "matrix",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": "condition:write",
    },
    {
        "code": "workflow:matrix:delete",
        "name": "Delete Routing Condition Rules",
        "module": "workflow",
        "subpage": "matrix",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": "condition:write",
    },
    {
        "code": "workflow:checklists:view",
        "name": "View Checklist Condition Rules",
        "module": "workflow",
        "subpage": "checklists",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:checklists:create",
        "name": "Create Checklist Condition Rules",
        "module": "workflow",
        "subpage": "checklists",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:checklists:edit",
        "name": "Modify Checklist Condition Rules",
        "module": "workflow",
        "subpage": "checklists",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:checklists:delete",
        "name": "Delete Checklist Condition Rules",
        "module": "workflow",
        "subpage": "checklists",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:templates:view",
        "name": "View AI Extraction Templates",
        "module": "workflow",
        "subpage": "templates",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:templates:create",
        "name": "Create AI Extraction Templates",
        "module": "workflow",
        "subpage": "templates",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:templates:edit",
        "name": "Modify AI Extraction Templates",
        "module": "workflow",
        "subpage": "templates",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "workflow:templates:delete",
        "name": "Delete AI Extraction Templates",
        "module": "workflow",
        "subpage": "templates",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },

    # --- 3. ADMINISTRATION (admin) ---
    {
        "code": "admin:users:view",
        "name": "View User Master List",
        "module": "admin",
        "subpage": "users",
        "action": "VIEW",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:users:create",
        "name": "Register New Employees / Users",
        "module": "admin",
        "subpage": "users",
        "action": "CREATE",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": "user:manage",
    },
    {
        "code": "admin:users:edit",
        "name": "Update Employee Profiles & Status",
        "module": "admin",
        "subpage": "users",
        "action": "EDIT",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": "user:manage",
    },
    {
        "code": "admin:users:delete",
        "name": "Deactivate / Purge User Accounts",
        "module": "admin",
        "subpage": "users",
        "action": "DELETE",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": "user:manage",
    },
    {
        "code": "admin:users:reset_pwd",
        "name": "Reset Employee Passwords",
        "module": "admin",
        "subpage": "users",
        "action": "RESET_PWD",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:users:export",
        "name": "Export User Master Directory",
        "module": "admin",
        "subpage": "users",
        "action": "EXPORT",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:rbac:view",
        "name": "View IAM Role & Permission Matrix",
        "module": "admin",
        "subpage": "rbac",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:rbac:create",
        "name": "Create Custom Roles",
        "module": "admin",
        "subpage": "rbac",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": "role:manage",
    },
    {
        "code": "admin:rbac:edit",
        "name": "Modify Role Permissions & Scopes",
        "module": "admin",
        "subpage": "rbac",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": "role:manage",
    },
    {
        "code": "admin:rbac:delete",
        "name": "Deactivate / Delete Custom Roles",
        "module": "admin",
        "subpage": "rbac",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": "role:manage",
    },
    {
        "code": "admin:raci:view",
        "name": "View Email & RACI Notification Rules",
        "module": "admin",
        "subpage": "raci",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:raci:edit",
        "name": "Configure Email Providers & RACI Matrix",
        "module": "admin",
        "subpage": "raci",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:raci:test",
        "name": "Send Test Email Notifications",
        "module": "admin",
        "subpage": "raci",
        "action": "TEST",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:inapp:view",
        "name": "View In-App Notification Settings",
        "module": "admin",
        "subpage": "inapp",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:inapp:edit",
        "name": "Configure In-App Notification Providers",
        "module": "admin",
        "subpage": "inapp",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:audit:view",
        "name": "Inspect System Immutable Audit Trail",
        "module": "admin",
        "subpage": "audit",
        "action": "VIEW",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": "audit:read",
    },
    {
        "code": "admin:audit:export",
        "name": "Export Audit Trails & Event Logs",
        "module": "admin",
        "subpage": "audit",
        "action": "EXPORT",
        "supported_scopes": "DEPARTMENT,DIVISION,ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:audit:purge",
        "name": "Purge Old Audit Records by Retention",
        "module": "admin",
        "subpage": "audit",
        "action": "PURGE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:backups:view",
        "name": "View Database Backup History",
        "module": "admin",
        "subpage": "backups",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:backups:create",
        "name": "Trigger On-Demand Database Backup",
        "module": "admin",
        "subpage": "backups",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:backups:download",
        "name": "Download Database Backup Files",
        "module": "admin",
        "subpage": "backups",
        "action": "DOWNLOAD",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:system:view",
        "name": "View System Settings & ERP Masters",
        "module": "admin",
        "subpage": "system",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:system:create",
        "name": "Ingest ERP Master Data",
        "module": "admin",
        "subpage": "system",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:system:edit",
        "name": "Update System Master Configurations",
        "module": "admin",
        "subpage": "system",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "admin:system:delete",
        "name": "Delete ERP Master Records",
        "module": "admin",
        "subpage": "system",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },

    # --- 4. INTEGRATIONS (integration) ---
    {
        "code": "integration:applications:view",
        "name": "View 3rd-Party Registered Apps",
        "module": "integration",
        "subpage": "applications",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:applications:create",
        "name": "Register 3rd-Party Applications",
        "module": "integration",
        "subpage": "applications",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:applications:edit",
        "name": "Update 3rd-Party Applications",
        "module": "integration",
        "subpage": "applications",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:applications:delete",
        "name": "Revoke / Delete 3rd-Party Apps",
        "module": "integration",
        "subpage": "applications",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:applications:regenerate_key",
        "name": "Regenerate API Secrets & Keys",
        "module": "integration",
        "subpage": "applications",
        "action": "REGENERATE_KEY",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:callbacks:view",
        "name": "View Webhook & Callback Rules",
        "module": "integration",
        "subpage": "callbacks",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:callbacks:create",
        "name": "Create Callback Dispatch Rules",
        "module": "integration",
        "subpage": "callbacks",
        "action": "CREATE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:callbacks:edit",
        "name": "Modify Callback Dispatch Rules",
        "module": "integration",
        "subpage": "callbacks",
        "action": "EDIT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:callbacks:delete",
        "name": "Delete Callback Dispatch Rules",
        "module": "integration",
        "subpage": "callbacks",
        "action": "DELETE",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:logs:view",
        "name": "Inspect Webhook Delivery Logs",
        "module": "integration",
        "subpage": "logs",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:logs:retry",
        "name": "Manually Retry Failed Webhook Dispatches",
        "module": "integration",
        "subpage": "logs",
        "action": "RETRY",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:logs:export",
        "name": "Export Webhook Delivery Logs",
        "module": "integration",
        "subpage": "logs",
        "action": "EXPORT",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:sync:view",
        "name": "View ERP / DAPI Sync Status",
        "module": "integration",
        "subpage": "sync",
        "action": "VIEW",
        "supported_scopes": "ALL",
        "legacy_code": None,
    },
    {
        "code": "integration:sync:execute",
        "name": "Trigger Manual ERP Data Ingestion",
        "module": "integration",
        "subpage": "sync",
        "action": "EXECUTE",
        "supported_scopes": "ALL",
        "legacy_code": "sync:execute",
    },
]

def seed_catalogue():
    db_url = settings.get_database_url()
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        created_count = 0
        updated_count = 0

        # 1. Upsert permissions from CATALOGUE
        for item in CATALOGUE:
            existing = db.query(Permission).filter(Permission.code == item["code"]).first()
            if existing:
                existing.name = item["name"]
                existing.module = item["module"]
                existing.subpage = item["subpage"]
                existing.action = item["action"]
                existing.supported_scopes = item["supported_scopes"]
                if item["legacy_code"]:
                    existing.legacy_code = item["legacy_code"]
                updated_count += 1
            else:
                new_perm = Permission(
                    code=item["code"],
                    name=item["name"],
                    module=item["module"],
                    subpage=item["subpage"],
                    action=item["action"],
                    supported_scopes=item["supported_scopes"],
                    legacy_code=item["legacy_code"],
                )
                db.add(new_perm)
                created_count += 1

        db.commit()
        logger.info(f"Permissions catalogue seeded: {created_count} created, {updated_count} updated.")

        # 2. Assign all permissions to Administrator role
        admin_role = db.query(Role).filter(Role.code.ilike("admin")).first()
        if admin_role:
            all_perms = db.query(Permission).all()
            assigned_to_admin = 0
            for perm in all_perms:
                rp = db.query(RolePermission).filter(
                    RolePermission.role_id == admin_role.id,
                    RolePermission.permission_id == perm.id
                ).first()
                if not rp:
                    db.add(RolePermission(role_id=admin_role.id, permission_id=perm.id, scope="ALL"))
                    assigned_to_admin += 1
                else:
                    if not rp.scope:
                        rp.scope = "ALL"
            db.commit()
            logger.info(f"Assigned {assigned_to_admin} new permissions to role '{admin_role.code}' with scope='ALL'.")

        total_perms = db.query(Permission).count()
        total_rp = db.query(RolePermission).count()
        logger.info(f"Total permissions in DB: {total_perms}, Total role_permission mappings: {total_rp}")

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to seed catalogue: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_catalogue()
