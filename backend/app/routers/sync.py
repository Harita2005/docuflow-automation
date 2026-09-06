import json
import base64
import datetime
import logging
from pathlib import Path
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog, SystemLog, InvoiceChecklistState, InvoiceLineItem
from app.schemas import (
    DocumentSyncRequest, DocumentSyncResponse,
    BatchSyncRequest, BatchSyncResponse, BatchSyncItemResult,
    Base64AttachmentSyncRequest, AttachmentSyncResponse
)
from app.services.rules_engine import get_doc_type_prefix
from app.services.ocr_service import extract_text_from_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["Enterprise Data & Attachment Sync"])

def generate_compliance_checklist_for_category(
    category: Optional[str], 
    doc_type: Optional[str], 
    division: Optional[str] = None, 
    plant: Optional[str] = None,
    document_id: Optional[str] = None,
    workflow_profile: Optional[str] = None,
    stage_name: Optional[str] = None,
    db: Optional[Any] = None
) -> List[str]:
    """
    Strict rule-based checklist resolution.
    Queries database rules from FlowBuilder, ChecklistRule and ChecklistTemplate.
    Returns empty list [] if no checklist items are configured by admin.
    """
    try:
        from app.database import SessionLocal
        from app.routers.documents import resolve_checklist_items
        
        local_db = db or SessionLocal()
        try:
            # Build a lightweight mock invoice for resolution
            mock_inv = Invoice(
                division=division or "VCC",
                category=category,
                document_type=doc_type or "AP INVOICE",
                plant=plant,
                workflow_profile_id=workflow_profile
            )
            items = resolve_checklist_items(local_db, mock_inv, stage_name or "Attachment Status")
            if items:
                return items
        finally:
            if not db:
                local_db.close()
    except Exception as e:
        logger.warning(f"[Checklist Resolution] Notice during DB checklist query: {e}")

    return []

def _sync_to_production_schema(req: DocumentSyncRequest, db: Session, target_inv: Invoice):
    try:
        from sqlalchemy import text

        if db.bind and db.bind.dialect.name == "mssql":
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'integration') EXEC('CREATE SCHEMA integration');"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'core') EXEC('CREATE SCHEMA core');"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'security') EXEC('CREATE SCHEMA security');"))
            db.execute(text("IF OBJECT_ID('integration.source_systems', 'U') IS NULL CREATE TABLE integration.source_systems (source_system_id INT IDENTITY(1,1) PRIMARY KEY, system_code VARCHAR(50) NOT NULL UNIQUE, system_name VARCHAR(200) NOT NULL, is_active BIT NOT NULL DEFAULT 1, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('integration.sync_runs', 'U') IS NULL CREATE TABLE integration.sync_runs (sync_run_id INT IDENTITY(1,1) PRIMARY KEY, source_system_id INT NOT NULL, idempotency_key VARCHAR(100) NOT NULL, sync_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED', records_processed INT NOT NULL DEFAULT 1, started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('integration.source_records', 'U') IS NULL CREATE TABLE integration.source_records (source_record_id INT IDENTITY(1,1) PRIMARY KEY, source_system_id INT NOT NULL, sync_run_id INT NULL, canonical_document_id INT NULL, external_record_key VARCHAR(100) NOT NULL, payload_json NVARCHAR(MAX) NULL, status VARCHAR(50) NULL DEFAULT 'RECEIVED', ingested_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(), created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='sync_run_id') ALTER TABLE integration.source_records ADD sync_run_id INT NULL;"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='canonical_document_id') ALTER TABLE integration.source_records ADD canonical_document_id INT NULL;"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='status') ALTER TABLE integration.source_records ADD status VARCHAR(50) NULL DEFAULT 'RECEIVED';"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='ingested_at') ALTER TABLE integration.source_records ADD ingested_at DATETIME2 NULL DEFAULT SYSUTCDATETIME();"))
            db.execute(text("IF OBJECT_ID('integration.source_record_versions', 'U') IS NULL CREATE TABLE integration.source_record_versions (version_id INT IDENTITY(1,1) PRIMARY KEY, source_record_id INT NOT NULL, version_number INT NOT NULL, payload_snapshot_json NVARCHAR(MAX) NULL, received_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('core.document_types', 'U') IS NULL CREATE TABLE core.document_types (document_type_id INT IDENTITY(1,1) PRIMARY KEY, type_code VARCHAR(50) NOT NULL UNIQUE, type_name VARCHAR(100) NOT NULL, is_active BIT NOT NULL DEFAULT 1, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('core.documents', 'U') IS NULL CREATE TABLE core.documents (document_id INT IDENTITY(1,1) PRIMARY KEY, document_type_id INT NOT NULL, source_record_id INT NULL, document_number VARCHAR(100) NOT NULL, created_by_user_id INT NULL, status VARCHAR(50) NOT NULL DEFAULT 'NEW', correlation_id UNIQUEIDENTIFIER NULL, is_deleted BIT NOT NULL DEFAULT 0, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='core' AND TABLE_NAME='documents' AND COLUMN_NAME='created_by_user_id') ALTER TABLE core.documents ADD created_by_user_id INT NULL;"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='core' AND TABLE_NAME='documents' AND COLUMN_NAME='correlation_id') ALTER TABLE core.documents ADD correlation_id UNIQUEIDENTIFIER NULL;"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='core' AND TABLE_NAME='documents' AND COLUMN_NAME='updated_at') ALTER TABLE core.documents ADD updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME();"))
            db.execute(text("IF OBJECT_ID('core.document_versions', 'U') IS NULL CREATE TABLE core.document_versions (version_id INT IDENTITY(1,1) PRIMARY KEY, document_id INT NOT NULL, version_number INT NOT NULL, document_snapshot_json NVARCHAR(MAX) NULL, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('core.document_metadata', 'U') IS NULL CREATE TABLE core.document_metadata (metadata_id INT IDENTITY(1,1) PRIMARY KEY, document_id INT NOT NULL, meta_key VARCHAR(100) NOT NULL, meta_value NVARCHAR(MAX) NULL, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('security.app_users', 'U') IS NULL CREATE TABLE security.app_users (user_id INT IDENTITY(1,1) PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, email VARCHAR(255) NULL, password_hash VARCHAR(255) NULL, external_user_key VARCHAR(100) NULL, is_active BIT NOT NULL DEFAULT 1, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'audit') EXEC('CREATE SCHEMA audit');"))
            db.execute(text("IF OBJECT_ID('audit.audit_events', 'U') IS NULL CREATE TABLE audit.audit_events (event_id INT IDENTITY(1,1) PRIMARY KEY, correlation_id UNIQUEIDENTIFIER NULL, actor_user_id INT NULL, source_system_id INT NULL, event_category VARCHAR(50) NULL, event_type VARCHAR(100) NULL, entity_schema VARCHAR(50) NULL, entity_table VARCHAR(100) NULL, entity_id VARCHAR(100) NULL, action_type VARCHAR(50) NULL, before_json NVARCHAR(MAX) NULL, after_json NVARCHAR(MAX) NULL, metadata_json NVARCHAR(MAX) NULL, created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());"))
            db.execute(text("IF OBJECT_ID('rules.rule_evaluation_runs', 'U') IS NULL CREATE TABLE rules.rule_evaluation_runs (evaluation_run_id INT IDENTITY(1,1) PRIMARY KEY, document_id INT NOT NULL, run_time DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), correlation_id UNIQUEIDENTIFIER NULL);"))
            db.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='rules' AND TABLE_NAME='rule_evaluation_runs' AND COLUMN_NAME='evaluation_run_id') AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='rules' AND TABLE_NAME='rule_evaluation_runs' AND COLUMN_NAME='run_id') EXEC sp_rename 'rules.rule_evaluation_runs.run_id', 'evaluation_run_id', 'COLUMN';"))

        # 1. Ensure source system exists
        sys_code = req.company_code or req.division or "APP_A"
        sys_name = f"System for {sys_code}"
        db.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM integration.source_systems WHERE system_code = :sys_code)
            BEGIN
                INSERT INTO integration.source_systems (system_code, system_name, is_active, created_at)
                VALUES (:sys_code, :sys_name, 1, SYSUTCDATETIME())
            END
        """), {"sys_code": sys_code, "sys_name": sys_name})
        
        sys_row = db.execute(text("SELECT source_system_id FROM integration.source_systems WHERE system_code = :sys_code"), {"sys_code": sys_code}).fetchone()
        sys_id = sys_row[0] if sys_row else 1

        # 2. Ensure sync run exists
        idempotency_key = req.doc_key or f"SYNC-KEY-{int(datetime.datetime.utcnow().timestamp())}"
        db.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM integration.sync_runs WHERE source_system_id = :sys_id AND idempotency_key = :key)
            BEGIN
                INSERT INTO integration.sync_runs (source_system_id, idempotency_key, sync_status, records_processed, started_at)
                VALUES (:sys_id, :key, 'COMPLETED', 1, SYSUTCDATETIME())
            END
        """), {"sys_id": sys_id, "key": idempotency_key})
        
        run_row = db.execute(text("SELECT sync_run_id FROM integration.sync_runs WHERE source_system_id = :sys_id AND idempotency_key = :key"), {"sys_id": sys_id, "key": idempotency_key}).fetchone()
        run_id = run_row[0] if run_row else 1

        # 3. Create or update source record
        raw_payload = json.dumps(req.dict(), default=str)
        rec_row = db.execute(text("SELECT source_record_id, payload_json FROM integration.source_records WHERE source_system_id = :sys_id AND external_record_key = :key"), {"sys_id": sys_id, "key": idempotency_key}).fetchone()
        
        source_rec_id = None
        if rec_row:
            source_rec_id = rec_row[0]
            old_payload = rec_row[1]
            if old_payload != raw_payload:
                # Add version history record
                db.execute(text("""
                    DECLARE @ver INT = (SELECT COALESCE(MAX(version_number), 0) + 1 FROM integration.source_record_versions WHERE source_record_id = :rec_id);
                    INSERT INTO integration.source_record_versions (source_record_id, version_number, payload_snapshot_json, received_at)
                    VALUES (:rec_id, @ver, :old_payload, SYSUTCDATETIME())
                """), {"rec_id": source_rec_id, "old_payload": old_payload})
                
                # Update payload
                db.execute(text("""
                    UPDATE integration.source_records 
                    SET payload_json = :payload, status = 'RECEIVED'
                    WHERE source_record_id = :rec_id
                """), {"rec_id": source_rec_id, "payload": raw_payload})
        else:
            db.execute(text("""
                INSERT INTO integration.source_records (source_system_id, sync_run_id, external_record_key, payload_json, status, ingested_at)
                VALUES (:sys_id, :run_id, :key, :payload, 'RECEIVED', SYSUTCDATETIME())
            """), {"sys_id": sys_id, "run_id": run_id, "key": idempotency_key, "payload": raw_payload})
            rec_row_new = db.execute(text("SELECT source_record_id FROM integration.source_records WHERE source_system_id = :sys_id AND external_record_key = :key"), {"sys_id": sys_id, "key": idempotency_key}).fetchone()
            source_rec_id = rec_row_new[0] if rec_row_new else 1

        # 4. Ensure core document type exists
        doc_type_code = req.document_type or "AP INVOICE"
        db.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM core.document_types WHERE type_code = :code)
            BEGIN
                INSERT INTO core.document_types (type_code, type_name, is_active, created_at)
                VALUES (:code, :name, 1, SYSUTCDATETIME())
            END
        """), {"code": doc_type_code, "name": f"Document Type {doc_type_code}"})
        
        type_row = db.execute(text("SELECT document_type_id FROM core.document_types WHERE type_code = :code"), {"code": doc_type_code}).fetchone()
        doc_type_id = type_row[0] if type_row else 1

        # 5. Ensure security app user exists (defaulting to system or creator)
        creator_name = "system"
        db.execute(text("""
            IF NOT EXISTS (SELECT 1 FROM security.app_users WHERE username = :uname)
            BEGIN
                INSERT INTO security.app_users (username, email, password_hash, external_user_key, is_active, created_at)
                VALUES (:uname, :email, '$2b$12$Z0000000000000000000000000000000000000000000000000000', :uname, 1, SYSUTCDATETIME())
            END
        """), {"uname": creator_name, "email": "system@docuflow.local"})
        
        user_row = db.execute(text("SELECT user_id FROM security.app_users WHERE username = :uname"), {"uname": creator_name}).fetchone()
        user_id = user_row[0] if user_row else 1

        # 6. Create or update core document
        doc_number = req.invoice_number or f"INV-{idempotency_key}"
        doc_row = db.execute(text("SELECT document_id, status FROM core.documents WHERE document_type_id = :type_id AND document_number = :doc_num"), {"type_id": doc_type_id, "doc_num": doc_number}).fetchone()
        
        doc_id = None
        doc_status = target_inv.status or "SUBMITTED"
        if doc_status.startswith("Initiated") or doc_status.startswith("Pending Approval"):
            doc_status = "SUBMITTED"
            
        if doc_row:
            doc_id = doc_row[0]
            db.execute(text("""
                UPDATE core.documents 
                SET status = :status, updated_at = SYSUTCDATETIME()
                WHERE document_id = :doc_id
            """), {"status": doc_status, "doc_id": doc_id})
        else:
            db.execute(text("""
                INSERT INTO core.documents (document_type_id, document_number, created_by_user_id, status, correlation_id, created_at, updated_at)
                VALUES (:type_id, :doc_num, :user_id, :status, NEWID(), SYSUTCDATETIME(), SYSUTCDATETIME())
            """), {"type_id": doc_type_id, "doc_num": doc_number, "user_id": user_id, "status": doc_status})
            
            doc_row_new = db.execute(text("SELECT document_id FROM core.documents WHERE document_type_id = :type_id AND document_number = :doc_num"), {"type_id": doc_type_id, "doc_num": doc_number}).fetchone()
            doc_id = doc_row_new[0] if doc_row_new else 1

        # Create version snap in core.document_versions
        db.execute(text("""
            DECLARE @doc_ver INT = (SELECT COALESCE(MAX(version_number), 0) + 1 FROM core.document_versions WHERE document_id = :doc_id);
            INSERT INTO core.document_versions (document_id, version_number, document_snapshot_json, created_at)
            VALUES (:doc_id, @doc_ver, :snap, SYSUTCDATETIME())
        """), {"doc_id": doc_id, "snap": raw_payload})

        # 7. Update source record with canonical document reference
        db.execute(text("""
            UPDATE integration.source_records 
            SET canonical_document_id = :doc_id, status = 'NORMALIZED'
            WHERE source_record_id = :rec_id
        """), {"doc_id": doc_id, "rec_id": source_rec_id})

        # 8. Rebuild metadata
        db.execute(text("DELETE FROM core.document_metadata WHERE document_id = :doc_id"), {"doc_id": doc_id})
        
        metadata_items = [
            ("amount", str(getattr(req, "amount", 0.0))),
            ("base_amount", str(getattr(req, "base_amount", 0.0) or 0.0)),
            ("tax_amount", str(getattr(req, "tax_amount", 0.0) or 0.0)),
            ("cgst", str(getattr(req, "cgst", 0.0) or 0.0)),
            ("sgst", str(getattr(req, "sgst", 0.0) or 0.0)),
            ("igst", str(getattr(req, "igst", 0.0) or 0.0)),
            ("vendor_code", getattr(req, "vendor_code", "") or ""),
            ("vendor_name", getattr(req, "vendor_name", "") or ""),
            ("cost_center", getattr(req, "cost_center", "") or ""),
            ("plant", getattr(req, "plant", "") or ""),
            ("payment_terms", getattr(req, "payment_terms", "") or "")
        ]
        
        for k, v in metadata_items:
            db.execute(text("""
                INSERT INTO core.document_metadata (document_id, meta_key, meta_value, created_at)
                VALUES (:doc_id, :key, :val, SYSUTCDATETIME())
            """), {"doc_id": doc_id, "key": k, "val": v})

        # 9. Rule Evaluation Run logging
        db.execute(text("""
            INSERT INTO rules.rule_evaluation_runs (document_id, run_time, correlation_id)
            VALUES (:doc_id, SYSUTCDATETIME(), NEWID())
        """), {"doc_id": doc_id})
        
        run_row_new = db.execute(text("SELECT TOP 1 evaluation_run_id FROM rules.rule_evaluation_runs WHERE document_id = :doc_id ORDER BY run_time DESC"), {"doc_id": doc_id}).fetchone()
        eval_run_id = run_row_new[0] if run_row_new else 1

        if target_inv.workflow_profile_id:
            try:
                has_rules_table = db.execute(text("SELECT OBJECT_ID('rules.business_rules', 'U')")).scalar()
                if has_rules_table:
                    rule_row = db.execute(text("SELECT rule_id FROM rules.business_rules r JOIN workflow.workflow_definitions d ON r.target_workflow_definition_id = d.workflow_definition_id WHERE d.definition_name = :wf_name"), {"wf_name": target_inv.workflow_profile_id}).fetchone()
                    if rule_row:
                        db.execute(text("""
                            INSERT INTO rules.rule_evaluation_results (evaluation_run_id, rule_id, evaluation_status, created_at)
                            VALUES (:run_id, :rule_id, 'MATCHED', SYSUTCDATETIME())
                        """), {"run_id": eval_run_id, "rule_id": rule_row[0]})
            except Exception:
                # Explicitly handled fallback for optional feature
                pass

        # 10. Instantiate Workflow execution runtime
        if target_inv.workflow_profile_id:
            try:
                has_wf_table = db.execute(text("SELECT OBJECT_ID('workflow.workflow_definitions', 'U')")).scalar()
                if has_wf_table:
                    wf_name = target_inv.workflow_profile_id
                    ver_row = db.execute(text("""
                        SELECT v.workflow_version_id 
                        FROM workflow.workflow_versions v 
                        JOIN workflow.workflow_definitions d ON v.workflow_definition_id = d.workflow_definition_id 
                        WHERE d.definition_name = :wf_name AND v.is_published = 1
                    """), {"wf_name": wf_name}).fetchone()
                    
                    if ver_row:
                        wf_ver_id = ver_row[0]
                        inst_row = db.execute(text("SELECT workflow_instance_id FROM workflow.workflow_instances WHERE document_id = :doc_id AND status = 'ACTIVE'"), {"doc_id": doc_id}).fetchone()
                        
                        wf_inst_id = None
                        if inst_row:
                            wf_inst_id = inst_row[0]
                        else:
                            db.execute(text("""
                                INSERT INTO workflow.workflow_instances (document_id, workflow_version_id, status, started_at)
                                VALUES (:doc_id, :ver_id, 'ACTIVE', SYSUTCDATETIME())
                            """), {"doc_id": doc_id, "ver_id": wf_ver_id})
                            inst_row_new = db.execute(text("SELECT workflow_instance_id FROM workflow.workflow_instances WHERE document_id = :doc_id AND status = 'ACTIVE'"), {"doc_id": doc_id}).fetchone()
                            wf_inst_id = inst_row_new[0] if inst_row_new else 1

                        stage_code = f"STAGE_{target_inv.current_stage or 1}"
                        stage_row = db.execute(text("""
                            SELECT workflow_stage_id, stage_name 
                            FROM workflow.workflow_stages 
                            WHERE workflow_version_id = :ver_id AND stage_code = :code
                        """), {"ver_id": wf_ver_id, "code": stage_code}).fetchone()
                        
                        if stage_row:
                            stage_id = stage_row[0]
                            stage_row[1]
                            stage_inst_row = db.execute(text("SELECT stage_instance_id FROM workflow.stage_instances WHERE workflow_instance_id = :inst_id AND workflow_stage_id = :stage_id AND status = 'ACTIVE'"), {"inst_id": wf_inst_id, "stage_id": stage_id}).fetchone()
                            
                            stage_inst_id = None
                            if stage_inst_row:
                                stage_inst_id = stage_inst_row[0]
                            else:
                                db.execute(text("""
                                    INSERT INTO workflow.stage_instances (workflow_instance_id, workflow_stage_id, status, started_at)
                                    VALUES (:inst_id, :stage_id, 'ACTIVE', SYSUTCDATETIME())
                                """), {"inst_id": wf_inst_id, "stage_id": stage_id})
                                stage_inst_row_new = db.execute(text("SELECT stage_instance_id FROM workflow.stage_instances WHERE workflow_instance_id = :inst_id AND workflow_stage_id = :stage_id AND status = 'ACTIVE'"), {"inst_id": wf_inst_id, "stage_id": stage_id}).fetchone()
                                stage_inst_id = stage_inst_row_new[0] if stage_inst_row_new else 1

                            if target_inv.assigned_approver:
                                approver_uname = target_inv.assigned_approver
                                app_user_row = db.execute(text("SELECT user_id FROM security.app_users WHERE username = :uname"), {"uname": approver_uname}).fetchone()
                                if app_user_row:
                                    app_user_id = app_user_row[0]
                                    assign_row = db.execute(text("SELECT task_assignment_id FROM workflow.task_assignments WHERE stage_instance_id = :inst_id AND assigned_user_id = :u_id AND status = 'ASSIGNED'"), {"inst_id": stage_inst_id, "u_id": app_user_id}).fetchone()
                                    if not assign_row:
                                        db.execute(text("""
                                            INSERT INTO workflow.task_assignments (stage_instance_id, assigned_user_id, status, due_date)
                                            VALUES (:inst_id, :u_id, 'ASSIGNED', DATEADD(day, 2, SYSUTCDATETIME()))
                                        """), {"inst_id": stage_inst_id, "u_id": app_user_id})

                            # Seed Checklist Items
                            db.execute(text("""
                                INSERT INTO workflow.checklist_items (stage_instance_id, item_text, is_mandatory, is_checked)
                                SELECT :stage_inst_id, t.item_text, t.is_mandatory, 0
                                FROM workflow.workflow_checklist_templates t
                                WHERE t.workflow_stage_id = :stage_id
                                  AND NOT EXISTS (
                                      SELECT 1 FROM workflow.checklist_items i 
                                      WHERE i.stage_instance_id = :stage_inst_id 
                                        AND i.item_text = t.item_text
                                  )
                            """), {"stage_inst_id": stage_inst_id, "stage_id": stage_id})
            except Exception:
                # Explicitly handled fallback for optional feature
                pass

        # 11. Log immutable audit event
        db.execute(text("""
            INSERT INTO audit.audit_events (correlation_id, actor_user_id, source_system_id, event_category, event_type, entity_schema, entity_table, entity_id, action_type, after_json, metadata_json)
            VALUES (NEWID(), :user_id, :sys_id, 'INGESTION', 'DOCUMENT_SYNCED', 'core', 'documents', CAST(:doc_id AS VARCHAR), 'INSERT', :snap, :meta)
        """), {"user_id": user_id, "sys_id": sys_id, "doc_id": doc_id, "snap": raw_payload, "meta": json.dumps({"action": "Data Sync Ingestion"})})

    except Exception as e:
        print(f"[Schema Sync Error] Failed to dual-write record: {e}")


def _upsert_single_document(req: DocumentSyncRequest, db: Session) -> Invoice:
    """Internal helper to idempotently insert or update an invoice from sync data."""
    effective_division = req.company_code or req.division or "VCC"
    
    # 1. Look for existing document by DocKey or (InvoiceNumber + Division)
    existing: Optional[Invoice] = None
    if req.doc_key:
        existing = db.query(Invoice).filter(Invoice.doc_key == str(req.doc_key)).first()
    
    if not existing and req.invoice_number:
        existing = db.query(Invoice).filter(
            Invoice.invoice_number == req.invoice_number,
            Invoice.division == effective_division
        ).first()

    # Calculate base and tax amounts if not provided
    calculated_base = req.base_amount
    calculated_tax = req.tax_amount
    if req.amount > 0 and (calculated_base is None or calculated_tax is None):
        calculated_base = round(req.amount / 1.18, 2)
        calculated_tax = round(req.amount - calculated_base, 2)

    line_items_str = json.dumps(req.line_items) if req.line_items else None
    custom_data_str = json.dumps(req.custom_data) if req.custom_data else None

    if existing:
        # Update existing record
        existing.doc_num = req.doc_num or existing.doc_num
        existing.vendor_name = req.vendor_name or existing.vendor_name
        existing.vendor_code = req.vendor_code or existing.vendor_code
        existing.vendor_gstin = req.vendor_gstin or existing.vendor_gstin
        existing.invoice_number = req.invoice_number or existing.invoice_number
        existing.invoice_date = req.invoice_date or existing.invoice_date
        existing.po_number = req.po_number or existing.po_number
        existing.amount = req.amount if req.amount > 0 else existing.amount
        existing.base_amount = calculated_base if calculated_base else existing.base_amount
        existing.tax_amount = calculated_tax if calculated_tax else existing.tax_amount
        existing.document_type = req.document_type or existing.document_type
        existing.division = effective_division
        existing.category = req.category or existing.category
        existing.cost_center = req.cost_center or existing.cost_center
        existing.plant = req.plant or existing.plant
        existing.payment_terms = req.payment_terms or existing.payment_terms
        if line_items_str: existing.line_items_json = line_items_str
        if custom_data_str: existing.custom_data = custom_data_str
        existing.is_deleted = False
        existing.deleted_at = None
        
        target_inv = existing
    else:
        # Create new record
        timestamp = int(datetime.datetime.utcnow().timestamp() * 1000)
        prefix = get_doc_type_prefix(req.document_type or "", req.category or "")
        key = req.doc_key if req.doc_key else (timestamp % 100000)
        doc_id = f"{prefix}-{key}"
        
        new_inv = Invoice(
            id=doc_id,
            doc_key=str(req.doc_key) if req.doc_key is not None else None,
            doc_num=str(req.doc_num) if req.doc_num is not None else None,
            doc_date=req.invoice_date,
            vendor_name=req.vendor_name or "Unknown Vendor",
            vendor_code=req.vendor_code,
            vendor_gstin=req.vendor_gstin,
            invoice_number=req.invoice_number or f"INV-{timestamp % 10000}",
            invoice_date=req.invoice_date or datetime.date.today().strftime("%Y-%m-%d"),
            po_number=req.po_number,
            amount=req.amount,
            base_amount=calculated_base or 0.0,
            tax_amount=calculated_tax or 0.0,
            currency=req.currency or "INR",
            document_type=req.document_type or "AP INVOICE",
            division=effective_division,
            category=req.category,
            cost_center=req.cost_center,
            plant=req.plant,
            payment_terms=req.payment_terms or "Net 30",
            status="Pending Approval",
            current_stage=1,
            total_stages=2,
            line_items_json=line_items_str,
            custom_data=custom_data_str
        )
        db.add(new_inv)
        target_inv = new_inv

    db.commit()
    db.refresh(target_inv)

    # Synchronize line items to normalized table
    db.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == target_inv.id).delete()
    if req.line_items:
        for itm in req.line_items:
            db.add(InvoiceLineItem(
                invoice_id=target_inv.id,
                description=itm.get("description") or itm.get("item_description") or "Line Item",
                quantity=float(itm.get("quantity") or 1.0),
                unit_price=float(itm.get("unit_price") or itm.get("amount") or 0.0),
                amount=float(itm.get("amount") or 0.0),
                warranty_text=itm.get("warranty_text"),
                serial_numbers=",".join(itm.get("serial_numbers")) if isinstance(itm.get("serial_numbers"), list) else itm.get("serial_numbers")
            ))
    db.commit()

    # 2. Automated Business Rules Evaluation & Flow Initiation (Preserve Approved/Cancelled status on re-sync)
    if req.auto_route and target_inv.status not in ["Approved", "Cancelled"]:
        from app.services.rules_engine import evaluate_business_rules_full
        rule_eval_res = evaluate_business_rules_full(db, target_inv)
        target_wf = rule_eval_res.get("target_workflow_id") if rule_eval_res else None
        rule_action = rule_eval_res.get("rule_action", "WORKFLOW_ROUTE") if rule_eval_res else "WORKFLOW_ROUTE"
        cancel_reason = rule_eval_res.get("cancel_reason", "Auto-cancelled by Policy Engine") if rule_eval_res else None
        matched_rule_name = rule_eval_res.get("rule_name", "Default Policy") if rule_eval_res else "Default Policy"

        profile = None
        if target_wf:
            profile = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == target_wf).first()

        if profile:
            from app.services.rules_engine import infer_document_type
            target_inv.workflow_profile_id = profile.profile_name
            target_inv.document_type = profile.workflow_type or infer_document_type(category=target_inv.category, wf_name=target_wf, doc_type=target_inv.document_type)
            steps = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == profile.profile_name
            ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
            
            target_inv.total_stages = len(steps) if steps else 2

            if rule_action == "AUTO_APPROVE":
                target_inv.status = "Approved"
                target_inv.current_stage = target_inv.total_stages
                target_inv.assigned_approver = "System Auto-Approved"
                db.add(AuditLog(
                    invoice_id=target_inv.id,
                    user="Policy Engine (STP)",
                    action="AUTO_APPROVED",
                    stage="Straight-Through Processing",
                    notes=f"Document automatically approved by rule '{matched_rule_name}'."
                ))
            elif rule_action == "AUTO_CANCEL":
                target_inv.status = "Cancelled"
                target_inv.current_stage = 1
                target_inv.assigned_approver = "System Auto-Cancelled"
                db.add(AuditLog(
                    invoice_id=target_inv.id,
                    user="Policy Engine (Auto-Reject)",
                    action="AUTO_CANCELLED",
                    stage="Auto-Rejection Guard",
                    notes=f"Document auto-cancelled by rule '{matched_rule_name}'. Reason: {cancel_reason or 'Policy Violation'}"
                ))
            else:
                target_inv.current_stage = 1
                if steps:
                    target_inv.assigned_approver = steps[0].approver_target
                    target_inv.status = f"Initiated ({steps[0].step_name})"
                else:
                    target_inv.status = "Initiated (Stage 1)"

                from app.routers.documents import resolve_checklist_items
                current_step_name = steps[0].step_name if steps else "Attachment Status"
                stage_items = resolve_checklist_items(db, target_inv, current_step_name)

                # Delete any legacy states if retrying sync
                db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == target_inv.id).delete()
                for it_text in stage_items:
                    db.add(InvoiceChecklistState(
                        invoice_id=target_inv.id,
                        stage_name=current_step_name,
                        item_text=it_text,
                        is_checked=False
                    ))
                
                target_inv.checklist_state = json.dumps({it_text: False for it_text in stage_items})
        else:
            # NO RULE MATCHED: Strict compliance - do NOT start any random workflow or default approver
            target_inv.workflow_profile_id = None
            target_inv.assigned_approver = "Unassigned (No Rule Matched)"
            target_inv.status = "Unrouted (No Rule Matched)"
            target_inv.total_stages = 0
            target_inv.current_stage = 0
            db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == target_inv.id).delete()
            target_inv.checklist_state = json.dumps({})
            db.add(AuditLog(
                invoice_id=target_inv.id,
                user="Policy Engine (Unrouted)",
                action="UNROUTED",
                stage="Rule Evaluation",
                notes="Document ingested but no active business rule matched the document criteria. Pending rule creation."
            ))

        db.commit()
        db.refresh(target_inv)

    # 3. Log Sync Audit Entry (Pure Ingestion, not an approval)
    db.add(AuditLog(
        invoice_id=target_inv.id,
        user="ERP Data Sync",
        action="Data Ingested",
        stage="Intake (ERP)",
        notes=f"Invoice metadata ingested from ERP. Assigned status: {target_inv.status}."
    ))
    db.add(SystemLog(
        invoice_id=target_inv.id,
        action=f"Data Sync & Flow Initiation",
        user="Sync Engine",
        details=f"ERP Key: {target_inv.doc_key}, Total: ₹{target_inv.amount}, Plant: {target_inv.plant}, Status: {target_inv.status}"
    ))
    db.commit()

    # 4. Shadow dual-write to standard production tables (for monday demo)
    _sync_to_production_schema(req, db, target_inv)

    return target_inv


# --- 1. SINGLE RECORD / DOCUMENT SYNC ---
@router.post("/record", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/records", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/document", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/documents", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/invoice", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/invoices", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
def sync_single_document(payload: DocumentSyncRequest, db: Session = Depends(get_db)):
    """
    Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally.
    Auto-evaluates business rules, sets branch approver, and logs audit trail.
    If sync or routing fails, still commits the record with status 'Sync Failed' and logs the reason.
    """
    try:
        inv = _upsert_single_document(payload, db)
        return DocumentSyncResponse(
            success=True,
            message="Record synchronized and auto-routed successfully",
            document_id=inv.id,
            doc_key=inv.doc_key,
            invoice_number=inv.invoice_number,
            document_number=inv.invoice_number,
            vendor_name=inv.vendor_name,
            amount=inv.amount,
            division=inv.division,
            plant=inv.plant,
            workflow_profile_id=inv.workflow_profile_id,
            total_stages=inv.total_stages,
            current_stage=inv.current_stage,
            assigned_approver=inv.assigned_approver,
            status=inv.status
        )
    except Exception as e:
        db.rollback()
        try:
            # Sync the data anyway, but with status='Sync Failed'
            effective_division = payload.company_code or payload.division or "VCC"
            existing = None
            if payload.doc_key:
                existing = db.query(Invoice).filter(Invoice.doc_key == str(payload.doc_key)).first()
            if not existing and payload.invoice_number:
                existing = db.query(Invoice).filter(
                    Invoice.invoice_number == payload.invoice_number,
                    Invoice.division == effective_division
                ).first()
                
            calculated_base = payload.base_amount
            calculated_tax = payload.tax_amount
            if payload.amount > 0 and (calculated_base is None or calculated_tax is None):
                calculated_base = round(payload.amount / 1.18, 2)
                calculated_tax = round(payload.amount - calculated_base, 2)
                
            line_items_str = json.dumps(payload.line_items) if payload.line_items else None
            
            custom_data_dict = payload.custom_data or {}
            custom_data_dict["sync_success"] = False
            custom_data_dict["sync_failed_reason"] = str(e)
            custom_data_str = json.dumps(custom_data_dict)
            
            if existing:
                existing.doc_num = payload.doc_num or existing.doc_num
                existing.vendor_name = payload.vendor_name or existing.vendor_name
                existing.vendor_code = payload.vendor_code or existing.vendor_code
                existing.vendor_gstin = payload.vendor_gstin or existing.vendor_gstin
                existing.invoice_number = payload.invoice_number or existing.invoice_number
                existing.invoice_date = payload.invoice_date or existing.invoice_date
                existing.po_number = payload.po_number or existing.po_number
                existing.amount = payload.amount if payload.amount > 0 else existing.amount
                existing.base_amount = calculated_base if calculated_base else existing.base_amount
                existing.tax_amount = calculated_tax if calculated_tax else existing.tax_amount
                existing.document_type = payload.document_type or existing.document_type
                existing.division = effective_division
                existing.category = payload.category or existing.category
                existing.cost_center = payload.cost_center or existing.cost_center
                existing.plant = payload.plant or existing.plant
                existing.payment_terms = payload.payment_terms or existing.payment_terms
                if line_items_str: existing.line_items_json = line_items_str
                existing.custom_data = custom_data_str
                existing.status = "Sync Failed"
                target_inv = existing
            else:
                timestamp = int(datetime.datetime.utcnow().timestamp() * 1000)
                prefix = get_doc_type_prefix(payload.document_type or "", payload.category or "")
                key = payload.doc_key if payload.doc_key else (timestamp % 100000)
                doc_id = f"{prefix}-{key}"
                new_inv = Invoice(
                    id=doc_id,
                    doc_key=str(payload.doc_key) if payload.doc_key is not None else None,
                    doc_num=str(payload.doc_num) if payload.doc_num is not None else None,
                    doc_date=payload.invoice_date,
                    vendor_name=payload.vendor_name or "Unknown Vendor",
                    vendor_code=payload.vendor_code,
                    vendor_gstin=payload.vendor_gstin,
                    invoice_number=payload.invoice_number or f"INV-{timestamp % 10000}",
                    invoice_date=payload.invoice_date or datetime.date.today().strftime("%Y-%m-%d"),
                    po_number=payload.po_number,
                    amount=payload.amount,
                    base_amount=calculated_base or 0.0,
                    tax_amount=calculated_tax or 0.0,
                    currency=payload.currency or "INR",
                    document_type=payload.document_type or "AP INVOICE",
                    division=effective_division,
                    category=payload.category,
                    cost_center=payload.cost_center,
                    plant=payload.plant,
                    payment_terms=payload.payment_terms or "Net 30",
                    status="Sync Failed",
                    current_stage=1,
                    total_stages=2,
                    line_items_json=line_items_str,
                    custom_data=custom_data_str
                )
                db.add(new_inv)
                target_inv = new_inv
            
            db.commit()
            db.refresh(target_inv)
            
            db.add(SystemLog(
                invoice_id=target_inv.id,
                action="Data Sync Failed",
                user="Sync Engine",
                details=f"Sync failed for ERP Key {target_inv.doc_key}. Reason: {str(e)}"
            ))
            db.commit()
            
            return DocumentSyncResponse(
                success=False,
                message=f"Data synchronized with warnings (workflow routing failed): {str(e)}",
                document_id=target_inv.id,
                doc_key=target_inv.doc_key,
                invoice_number=target_inv.invoice_number,
                document_number=target_inv.invoice_number,
                vendor_name=target_inv.vendor_name,
                amount=target_inv.amount,
                division=target_inv.division,
                plant=target_inv.plant,
                workflow_profile_id=target_inv.workflow_profile_id,
                total_stages=target_inv.total_stages,
                current_stage=target_inv.current_stage,
                assigned_approver=target_inv.assigned_approver,
                status=target_inv.status
            )
        except Exception as inner_e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Data synchronization failed completely: {str(inner_e)}")


# --- 2. BATCH / BULK RECORD SYNC ---
@router.post("/records/batch", response_model=BatchSyncResponse)
@router.post("/batch", response_model=BatchSyncResponse)
@router.post("/invoices/batch", response_model=BatchSyncResponse)
def sync_batch_documents(payload: BatchSyncRequest, db: Session = Depends(get_db)):
    """
    High-throughput bulk synchronization endpoint for scheduled ERP batch cron jobs (up to 500 records per call).
    Provides atomic isolation: single item failure does not disrupt the entire batch.
    """
    results: List[BatchSyncItemResult] = []
    success_count = 0
    failed_count = 0

    for idx, doc_req in enumerate(payload.documents):
        try:
            inv = _upsert_single_document(doc_req, db)
            results.append(BatchSyncItemResult(
                index=idx,
                document_id=inv.id,
                doc_key=inv.doc_key,
                invoice_number=inv.invoice_number,
                document_number=inv.invoice_number,
                status="SUCCESS"
            ))
            success_count += 1
        except Exception as e:
            results.append(BatchSyncItemResult(
                index=idx,
                doc_key=doc_req.doc_key,
                invoice_number=doc_req.invoice_number,
                document_number=doc_req.invoice_number,
                status="FAILED",
                error=str(e)
            ))
            failed_count += 1

    return BatchSyncResponse(
        total_received=len(payload.documents),
        successful_count=success_count,
        failed_count=failed_count,
        results=results
    )


# --- 3. ATTACHMENT MULTIPART FILE SYNC ---
@router.post("/attachment/upload", response_model=AttachmentSyncResponse)
async def sync_attachment_upload(
    file: UploadFile = File(..., description="Binary attachment file (PDF, PNG, JPG, TIFF)"),
    doc_key: Optional[str] = Form(None, description="ERP DocKey"),
    record_id: Optional[str] = Form(None, description="Target Record ID (e.g. DOC-101)"),
    invoice_id: Optional[str] = Form(None, description="Target Record/Invoice ID (e.g. DOC-101)"),
    attachment_type: str = Form("Original Invoice", description="Type of attachment"),
    uploaded_by: str = Form("ERP Sync Service", description="Sync source or user"),
    db: Session = Depends(get_db)
):
    """
    Multipart file attachment synchronization.
    Saves document to secure storage, executes OCR extraction, and binds to the record.
    """
    target_id = record_id or invoice_id
    inv = None
    if doc_key:
        inv = db.query(Invoice).filter(Invoice.doc_key == doc_key).first()
    if not inv and target_id:
        inv = db.query(Invoice).filter((Invoice.id == target_id) | (Invoice.doc_key == target_id)).first()

    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Target record not found for DocKey: {doc_key} or ID: {target_id}. Sync record data first."
        )

    # 2. Save binary file
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    safe_name = f"{inv.id}.{ext}"
    file_path = settings.UPLOAD_DIR / safe_name

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    file_size = len(contents)
    file_url = f"/uploads/{safe_name}"

    # 3. OCR Text Extraction
    ocr_data = {}
    if file.filename.lower().endswith(".pdf"):
        ocr_data = extract_text_from_pdf(file_path)

    # 4. Bind to record
    inv.file_url = file_url
    db.commit()

    # 5. Log audit
    db.add(AuditLog(
        invoice_id=inv.id,
        user=uploaded_by,
        action="Attachment Synced",
        stage=f"Stage {inv.current_stage}",
        notes=f"Attached {attachment_type}: {file.filename} ({round(file_size/1024, 1)} KB)."
    ))
    db.commit()

    return AttachmentSyncResponse(
        success=True,
        message="Attachment synchronized and bound to record successfully",
        document_id=inv.id,
        file_name=file.filename,
        file_url=file_url,
        file_size_bytes=file_size,
        ocr_extracted_fields=ocr_data
    )


# --- 4. ATTACHMENT BASE64 SYNC (FOR SAP / MIDDLEWARE JSON PAYLOADS) ---
@router.post("/attachment/base64", response_model=AttachmentSyncResponse)
def sync_attachment_base64(payload: Base64AttachmentSyncRequest, db: Session = Depends(get_db)):
    """
    Base64 encoded attachment synchronizer for JSON-only enterprise ESB pipelines (SAP PI/PO, MuleSoft, WebMethods).
    Decodes binary, stores file, runs OCR validation, and attaches to the target record.
    """
    target_id = getattr(payload, 'record_id', None) or payload.invoice_id
    inv = None
    if payload.doc_key:
        inv = db.query(Invoice).filter(Invoice.doc_key == payload.doc_key).first()
    if not inv and target_id:
        inv = db.query(Invoice).filter((Invoice.id == target_id) | (Invoice.doc_key == target_id)).first()

    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Target record not found for DocKey: {payload.doc_key} or ID: {target_id}."
        )

    # 2. Decode Base64
    try:
        binary_data = base64.b64decode(payload.file_content_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Base64 payload: {str(e)}")

    ext = payload.file_name.split('.')[-1] if '.' in payload.file_name else 'pdf'
    safe_name = f"{inv.id}.{ext}"
    file_path = settings.UPLOAD_DIR / safe_name

    with open(file_path, "wb") as f:
        f.write(binary_data)

    file_size = len(binary_data)
    file_url = f"/uploads/{safe_name}"

    # 3. OCR Extraction
    ocr_data = {}
    if payload.file_name.lower().endswith(".pdf"):
        ocr_data = extract_text_from_pdf(file_path)

    # 4. Bind to invoice
    inv.file_url = file_url
    db.commit()

    # 5. Log audit
    db.add(AuditLog(
        invoice_id=inv.id,
        user=payload.uploaded_by or "ERP Base64 Sync",
        action="Attachment Synced (Base64)",
        stage=f"Stage {inv.current_stage}",
        notes=f"Attached {payload.attachment_type}: {payload.file_name} ({round(file_size/1024, 1)} KB)."
    ))
    db.commit()

    return AttachmentSyncResponse(
        success=True,
        message="Base64 attachment decoded, saved, and linked successfully",
        document_id=inv.id,
        file_name=payload.file_name,
        file_url=file_url,
        file_size_bytes=file_size,
        ocr_extracted_fields=ocr_data
    )


# --- 5. ATTACHMENT SYNC BY PRIMARY KEY (BINARY) ---
@router.post("/record/{record_id}/attachment", response_model=AttachmentSyncResponse)
async def sync_record_attachment_by_pk(
    record_id: str,
    file: UploadFile = File(..., description="Binary attachment file (PDF, PNG, JPG, TIFF)"),
    attachment_type: str = Form("Original Invoice", description="Type of attachment"),
    uploaded_by: str = Form("ERP Sync Service", description="Sync source or user"),
    db: Session = Depends(get_db)
):
    """
    Synchronizes a binary attachment to a record identified by its primary key (id).
    """
    inv = db.query(Invoice).filter(Invoice.id == record_id).first()
    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Target record with primary key '{record_id}' not found. Sync record data first."
        )

    # Save binary file
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    safe_name = f"{inv.id}.{ext}"
    file_path = Path(settings.UPLOAD_DIR) / safe_name

    # Ensure upload directory exists
    file_path.parent.mkdir(parents=True, exist_ok=True)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    file_size = len(contents)
    file_url = f"/uploads/{safe_name}"

    # OCR Text Extraction
    ocr_data = {}
    if file.filename.lower().endswith(".pdf"):
        ocr_data = extract_text_from_pdf(file_path)

    # Bind to record
    inv.file_url = file_url
    db.commit()

    # Log audit
    db.add(AuditLog(
        invoice_id=inv.id,
        user=uploaded_by,
        action="Attachment Synced (PK)",
        stage=f"Stage {inv.current_stage}",
        notes=f"Attached {attachment_type}: {file.filename} ({round(file_size/1024, 1)} KB) via Primary Key."
    ))
    db.commit()

    return AttachmentSyncResponse(
        success=True,
        message="Attachment synchronized and bound to record via primary key successfully",
        document_id=inv.id,
        file_name=file.filename,
        file_url=file_url,
        file_size_bytes=file_size,
        ocr_extracted_fields=ocr_data
    )


# --- 6. ATTACHMENT SYNC BY PRIMARY KEY (BASE64) ---
@router.post("/record/{record_id}/attachment/base64", response_model=AttachmentSyncResponse)
def sync_record_attachment_by_pk_base64(
    record_id: str,
    payload: Base64AttachmentSyncRequest,
    db: Session = Depends(get_db)
):
    """
    Synchronizes a Base64-encoded attachment to a record identified by its primary key (id).
    """
    inv = db.query(Invoice).filter(Invoice.id == record_id).first()
    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Target record with primary key '{record_id}' not found. Sync record data first."
        )

    # Decode Base64
    try:
        binary_data = base64.b64decode(payload.file_content_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Base64 payload: {str(e)}")

    upload_root = Path(settings.UPLOAD_DIR).resolve()
    base_file_name = os.path.basename(payload.file_name or "document.pdf")
    raw_ext = base_file_name.rsplit('.', 1)[-1] if '.' in base_file_name else 'pdf'
    clean_ext = re.sub(r'[^a-zA-Z0-9]', '', raw_ext) or "pdf"
    safe_name = f"{inv.id}.{clean_ext}"
    file_path = (upload_root / safe_name).resolve()

    try:
        if not file_path.is_relative_to(upload_root):
            raise HTTPException(status_code=400, detail="Invalid file path detected")
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=400, detail="Invalid file path detected")

    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(binary_data)

    file_size = len(binary_data)
    file_url = f"/uploads/{safe_name}"

    # OCR Extraction
    ocr_data = {}
    if payload.file_name.lower().endswith(".pdf"):
        ocr_data = extract_text_from_pdf(file_path)

    # Bind to invoice
    inv.file_url = file_url
    db.commit()

    # Log audit
    db.add(AuditLog(
        invoice_id=inv.id,
        user=payload.uploaded_by or "ERP Base64 Sync",
        action="Attachment Synced (PK Base64)",
        stage=f"Stage {inv.current_stage}",
        notes=f"Attached {payload.attachment_type}: {payload.file_name} ({round(file_size/1024, 1)} KB) via Primary Key."
    ))
    db.commit()

    return AttachmentSyncResponse(
        success=True,
        message="Base64 attachment decoded, saved, and linked via primary key successfully",
        document_id=inv.id,
        file_name=payload.file_name,
        file_url=file_url,
        file_size_bytes=file_size,
        ocr_extracted_fields=ocr_data
    )

@router.post("/seed-demo")
def seed_demo_invoices_endpoint(db: Session = Depends(get_db)):
    """API endpoint to seed/sync the 10 standard multi-category demo documents directly into the database on demand."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    data_path = base_dir / "data" / "production_data.json"
    if not data_path.exists():
        data_path = base_dir / "production_data.json"
    if not data_path.exists():
        raise HTTPException(status_code=404, detail="production_data.json not found")
    
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    invoices_data = data.get("invoices", [])
    seeded_count = 0
    for inv in invoices_data:
        existing = db.query(Invoice).filter(Invoice.id == inv.get("id")).first()
        if not existing:
            new_inv = Invoice(
                id=inv.get("id"),
                doc_key=inv.get("doc_key"),
                doc_num=inv.get("doc_num"),
                doc_date=inv.get("doc_date"),
                vendor_name=inv.get("vendor_name"),
                vendor_code=inv.get("vendor_code"),
                vendor_gstin=inv.get("vendor_gstin"),
                invoice_number=inv.get("invoice_number"),
                invoice_date=inv.get("invoice_date"),
                po_number=inv.get("po_number"),
                amount=inv.get("amount", 0.0),
                base_amount=inv.get("base_amount", 0.0),
                tax_amount=inv.get("tax_amount", 0.0),
                currency=inv.get("currency") or "INR",
                document_type=inv.get("document_type") or "AP INVOICE",
                division=inv.get("division") or "VCC",
                category=inv.get("category"),
                cost_center=inv.get("cost_center"),
                plant=inv.get("plant"),
                payment_terms=inv.get("payment_terms") or "Net 30",
                status=inv.get("status") or "Initiated (Attachment Status)",
                current_stage=inv.get("current_stage", 1),
                total_stages=inv.get("total_stages", 4),
                assigned_approver=inv.get("assigned_approver") or "YUVASREE",
                workflow_profile_id=inv.get("workflow_profile_id") or "EVOUCHER_INV SR10",
                file_url=inv.get("file_url")
            )
            db.add(new_inv)
            seeded_count += 1
    
    # Log Data Sync in Audit Log
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')
    db.add(AuditLog(
        invoice_id=None,
        user="ERP Data Sync",
        action="Data Sync Completed",
        stage="Data Synchronization",
        notes=f"Data sync completed from primary data source at {now_str}. Synced {seeded_count} documents into ledger."
    ))
    db.commit()
    return {"success": True, "seeded_count": seeded_count, "total_invoices": db.query(Invoice).count()}



