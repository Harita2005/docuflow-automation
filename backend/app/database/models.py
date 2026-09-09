import datetime
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database.connection import Base


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

class Division(Base):
    __tablename__ = "divisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    is_active = Column(Boolean, default=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    departments = relationship(
        "Department",
        back_populates="division_rel",
        cascade="all, delete-orphan",
    )


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    division_id = Column(
        Integer,
        ForeignKey("divisions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    is_active = Column(Boolean, default=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    division_rel = relationship(
        "Division",
        back_populates="departments",
    )


# ---------------------------------------------------------------------------
# Role & Permission
# ---------------------------------------------------------------------------

class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    permissions = relationship(
        "RolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
    )


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    module = Column(String(50), default="DOCUMENT", index=True)
    action = Column(String(50), default="READ")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_id = Column(
        Integer,
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission_id = Column(
        Integer,
        ForeignKey("permissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    role = relationship("Role", back_populates="permissions")
    permission = relationship("Permission")


# ---------------------------------------------------------------------------
# Document Lock
# ---------------------------------------------------------------------------

class DocumentLock(Base):
    __tablename__ = "document_locks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(
        String(100),
        ForeignKey("documents.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    username = Column(String(150), nullable=False)
    lock_token = Column(String(100), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_uid = Column(String(50), unique=True, index=True, nullable=True)
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    employee_name = Column(String(150), nullable=False)
    name = Column(String(150), nullable=True)
    username = Column(String(150), unique=True, index=True, nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone_number = Column(String(20), nullable=True)

    division_id = Column(
        Integer,
        ForeignKey("divisions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    department_id = Column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role_id = Column(
        Integer,
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    division = Column(String(100), default="VCC", index=True)
    department = Column(String(100), nullable=True)
    plant = Column(String(100), nullable=True, index=True)
    role = Column(String(100), default="employee", index=True)

    password_hash = Column(String(255), nullable=False)

    is_active = Column(Boolean, default=True, index=True)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    mfa_enabled = Column(Boolean, default=False)
    mfa_type = Column(String(50), default="EMAIL")
    mfa_secret = Column(String(100), nullable=True)

    last_login = Column(DateTime, nullable=True)

    active_session_id = Column(String(100), nullable=True, index=True)
    active_device_info = Column(String(255), nullable=True)
    session_created_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)

    created_by = Column(String(150), default="System Admin")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    division_rel = relationship(
        "Division",
        foreign_keys=[division_id],
    )
    department_rel = relationship(
        "Department",
        foreign_keys=[department_id],
    )
    role_rel = relationship(
        "Role",
        foreign_keys=[role_id],
    )


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(100), primary_key=True, index=True)
    doc_key = Column(String(100), index=True, nullable=True)
    doc_num = Column(String(100), index=True, nullable=True)
    doc_date = Column(String(50), nullable=True)

    party_name = Column(String(250), nullable=True, index=True)
    party_code = Column(String(100), nullable=True, index=True)
    party_tax_id = Column(String(50), nullable=True)

    vendor_name = Column(String(250), nullable=True)
    vendor_code = Column(String(100), nullable=True, index=True)
    vendor_gstin = Column(String(50), nullable=True)

    invoice_number = Column(String(150), nullable=True, index=True)
    invoice_date = Column(String(50), nullable=True)
    po_number = Column(String(100), nullable=True, index=True)

    amount = Column(Numeric(18, 2), default=0.0, nullable=False)
    base_amount = Column(Numeric(18, 2), default=0.0, nullable=False)
    tax_amount = Column(Numeric(18, 2), default=0.0, nullable=False)

    cgst = Column(Numeric(18, 2), default=0.0, nullable=True)
    sgst = Column(Numeric(18, 2), default=0.0, nullable=True)
    igst = Column(Numeric(18, 2), default=0.0, nullable=True)

    currency = Column(String(20), default="INR")
    document_type = Column(String(100), default="AP INVOICE", index=True)

    division = Column(String(100), default="VCC", index=True)
    category = Column(String(200), nullable=True, index=True)
    cost_center = Column(String(200), nullable=True, index=True)
    plant = Column(String(200), nullable=True, index=True)

    payment_terms = Column(String(100), default="Net 30")
    pay_mode = Column(String(20), default="BANK", nullable=True)

    status = Column(String(50), default="Pending Approval", index=True)
    current_stage = Column(Integer, default=1)
    total_stages = Column(Integer, default=2)
    assigned_approver = Column(String(500), nullable=True, index=True)
    workflow_profile_id = Column(String(200), nullable=True, index=True)

    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)

    checklist_state = Column(Text, nullable=True)
    line_items_json = Column(Text, nullable=True)
    custom_data = Column(Text, nullable=True)

    file_url = Column(String(500), nullable=True)
    file_path = Column(String(500), nullable=True)

    pi_indicator = Column(String(10), nullable=True)
    trans_type = Column(String(20), nullable=True)
    gstin = Column(String(15), nullable=True)
    doc_status = Column(Integer, default=0, nullable=True)
    doc_due_date = Column(String(50), nullable=True)
    contact_person = Column(String(100), nullable=True)
    link_column = Column(String(500), nullable=True)

    external_sync_status = Column(
        String(50),
        default="UNSYNCED",
        index=True,
    )
    external_sync_ref = Column(
        String(100),
        nullable=True,
        index=True,
    )
    external_synced_at = Column(DateTime, nullable=True)
    external_sync_system = Column(String(100), nullable=True)
    external_sync_error = Column(Text, nullable=True)

    source_application = Column(String(100), nullable=True, index=True)
    version = Column(Integer, default=1, nullable=False)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    line_items = relationship(
        "DocumentLineItem",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    checklist_states = relationship(
        "DocumentChecklistState",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    approval_logs = relationship(
        "DocumentApprovalLog",
        back_populates="document",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index(
            "ix_documents_assigned_status",
            "assigned_approver",
            "status",
        ),
        Index(
            "ix_documents_division_status",
            "division",
            "status",
        ),
        Index(
            "ix_documents_created_status",
            "created_at",
            "status",
        ),
    )


# ---------------------------------------------------------------------------
# Backward-compatible document aliases
# ---------------------------------------------------------------------------

Invoice = Document


class DocumentLineItem(Base):
    __tablename__ = "document_line_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(
        String(100),
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    description = Column(String(500), nullable=False)
    quantity = Column(Numeric(12, 2), default=1.0)
    unit_price = Column(Numeric(18, 2), default=0.0)
    amount = Column(Numeric(18, 2), default=0.0)

    item_code = Column(String(100), nullable=True)
    warranty_text = Column(String(500), nullable=True)
    serial_numbers = Column(String(1000), nullable=True)

    document = relationship(
        "Document",
        back_populates="line_items",
    )


InvoiceLineItem = DocumentLineItem


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------

class WorkflowProfile(Base):
    __tablename__ = "workflow_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(
        String(200),
        unique=True,
        index=True,
        nullable=False,
    )
    workflow_code = Column(String(100), nullable=True, index=True)
    workflow_category = Column(
        String(100),
        default="Vendor Payment Workflows",
    )
    workflow_type = Column(
        String(100),
        default="AP INVOICE",
    )
    description = Column(Text, nullable=True)
    status = Column(String(50), default="Active")
    approval_threshold = Column(Integer, default=100)
    rejection_handling = Column(
        String(100),
        default="Return to Previous Step",
    )
    reminder_interval_hours = Column(Integer, default=24)
    escalation_after_hours = Column(Integer, default=48)
    auto_escalation = Column(Boolean, default=False)

    rule_action = Column(
        String(50),
        default="WORKFLOW_ROUTE",
        index=True,
    )
    cancel_reason = Column(Text, nullable=True)

    auto_approve_enabled = Column(Boolean, default=False)
    auto_approve_condition = Column(Text, nullable=True)
    auto_cancel_enabled = Column(Boolean, default=False)
    auto_cancel_condition = Column(Text, nullable=True)

    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    steps = relationship(
        "WorkflowStepDefinition",
        back_populates="profile",
        cascade="all, delete-orphan",
    )


class WorkflowStepDefinition(Base):
    __tablename__ = "workflow_step_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(
        String(200),
        ForeignKey(
            "workflow_profiles.profile_name",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )
    stage_number = Column(Integer, nullable=False)
    step_name = Column(String(200), nullable=False)
    approver_type = Column(
        String(100),
        default="Approval Pool",
    )
    approver_target = Column(String(500), nullable=True)
    delegate_approver = Column(String(200), nullable=True)
    document_type = Column(
        String(100),
        default="AP INVOICE",
    )
    action_required = Column(
        String(100),
        default="Approve",
    )
    permissions = Column(
        String(200),
        default="Approve / Reject",
    )
    sla_hours = Column(Integer, default=48)
    checklist_json = Column(Text, nullable=True)

    profile = relationship(
        "WorkflowProfile",
        back_populates="steps",
    )


# ---------------------------------------------------------------------------
# Business Rules
# ---------------------------------------------------------------------------

class BusinessRule(Base):
    __tablename__ = "business_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(
        String(250),
        unique=True,
        index=True,
        nullable=False,
    )
    rule_category = Column(
        String(100),
        default="Vendor Payment Workflows",
    )
    document_type = Column(
        String(100),
        default="AP INVOICE",
    )
    priority = Column(Integer, default=10)
    target_workflow_id = Column(
        String(200),
        nullable=False,
        index=True,
    )
    conditions_json = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    rule_action = Column(
        String(50),
        default="WORKFLOW_ROUTE",
        index=True,
    )
    cancel_reason = Column(Text, nullable=True)

    auto_approve_enabled = Column(Boolean, default=False)
    auto_approve_condition = Column(Text, nullable=True)
    auto_cancel_enabled = Column(Boolean, default=False)
    auto_cancel_condition = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True, index=True)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------------------------------------------------------------------------
# Checklists
# ---------------------------------------------------------------------------

class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_profile = Column(String(200), index=True, nullable=False)
    stage_name = Column(String(200), index=True, nullable=False)
    item_text = Column(String(500), nullable=False)
    is_mandatory = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    sequence_order = Column(Integer, default=1)


class ChecklistRule(Base):
    __tablename__ = "checklist_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(200), nullable=False)
    division = Column(String(100), nullable=True)
    category = Column(String(200), nullable=True)
    cost_center = Column(String(200), nullable=True)
    branch = Column(String(200), nullable=True)
    workflow_profile = Column(String(200), nullable=True)
    stage_name = Column(String(200), nullable=False)
    item_text = Column(String(500), nullable=False)
    is_mandatory = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    sequence_order = Column(Integer, default=1)


class DocumentChecklistState(Base):
    __tablename__ = "document_checklist_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(
        String(100),
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    stage_name = Column(String(200), nullable=False, index=True)
    item_text = Column(String(500), nullable=False)
    is_mandatory = Column(Boolean, default=True, nullable=False)
    is_checked = Column(Boolean, default=False)
    checked_by = Column(String(150), nullable=True)
    checked_at = Column(DateTime, nullable=True)

    document = relationship(
        "Document",
        back_populates="checklist_states",
    )


InvoiceChecklistState = DocumentChecklistState


# ---------------------------------------------------------------------------
# Audit & Access Logs
# ---------------------------------------------------------------------------

class UserAccessLog(Base):
    __tablename__ = "user_access_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(150), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    status = Column(
        String(20),
        default="SUCCESS",
        nullable=False,
    )
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    failure_reason = Column(String(250), nullable=True)
    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )


class DocumentApprovalLog(Base):
    __tablename__ = "document_approval_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(
        String(100),
        ForeignKey("documents.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    user = Column(String(150), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    stage = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )

    document = relationship(
        "Document",
        back_populates="approval_logs",
    )


AuditLog = DocumentApprovalLog


class SystemEngineLog(Base):
    __tablename__ = "system_engine_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    module_name = Column(
        String(100),
        default="System Engine",
        index=True,
    )
    invoice_id = Column(
        String(100),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    action = Column(String(150), nullable=False)
    user = Column(
        String(150),
        default="System Engine",
    )
    log_level = Column(
        String(20),
        default="INFO",
        index=True,
    )
    details = Column(Text, nullable=True)
    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )

    document = relationship("Document")


SystemLog = SystemEngineLog


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationRaciMatrix(Base):
    __tablename__ = "notification_raci_matrices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_profile = Column(
        String(200),
        index=True,
        nullable=False,
    )
    event_name = Column(
        String(100),
        index=True,
        nullable=False,
    )
    responsible_emails = Column(Text, nullable=True)
    accountable_emails = Column(Text, nullable=True)
    consulted_emails = Column(Text, nullable=True)
    informed_emails = Column(Text, nullable=True)
    title_template = Column(String(500), nullable=True)
    message_template = Column(Text, nullable=True)


class NotificationProviderConfig(Base):
    __tablename__ = "notification_provider_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    smtp_server = Column(String(200), nullable=False)
    port = Column(Integer, default=587)
    username = Column(String(200), nullable=True)
    encrypted_password = Column(String(200), nullable=True)
    sender_email = Column(String(200), nullable=True)
    sender_name = Column(String(200), nullable=True)


class InAppNotification(Base):
    __tablename__ = "in_app_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    notification_id = Column(
        String(100),
        unique=True,
        index=True,
        default=lambda: f"NOTIF-{uuid.uuid4().hex[:8].upper()}",
    )
    document_id = Column(
        String(100),
        index=True,
        nullable=False,
    )
    recipient_handle = Column(
        String(200),
        index=True,
        nullable=False,
    )
    notification_type = Column(
        String(50),
        default="PENDING_APPROVAL",
    )
    title = Column(String(300), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )


# ---------------------------------------------------------------------------
# Third-party integrations
# ---------------------------------------------------------------------------

class ThirdPartyWebhookConfig(Base):
    __tablename__ = "third_party_webhook_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(
        String(150),
        default="Primary ERP Integration Endpoint",
        nullable=False,
    )
    target_url = Column(String(500), nullable=False)
    auth_header_name = Column(
        String(100),
        default="Authorization",
    )
    auth_token = Column(String(500), nullable=True)
    hmac_secret = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    events_json = Column(
        Text,
        default='["document.settled"]',
    )
    retry_count = Column(Integer, default=3)
    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )


class IntegrationSyncLog(Base):
    __tablename__ = "integration_sync_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(
        String(100),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sync_direction = Column(
        String(20),
        default="PUSH",
        index=True,
    )
    target_system = Column(
        String(100),
        default="WEBHOOK",
        index=True,
    )
    request_url = Column(String(500), nullable=True)
    status_code = Column(Integer, nullable=True)
    status = Column(
        String(50),
        default="PENDING",
        index=True,
    )
    external_reference = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    payload_snapshot = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )

    document = relationship("Document")


class ThirdPartyApplication(Base):
    __tablename__ = "third_party_applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    code = Column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )
    description = Column(Text, nullable=True)
    base_url = Column(String(500), nullable=False)
    environment = Column(
        String(30),
        default="Production",
    )
    status = Column(
        String(20),
        default="Active",
        index=True,
    )
    auth_type = Column(
        String(50),
        default="None",
    )
    auth_config_json = Column(Text, nullable=True)
    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    rules = relationship(
        "CallbackRule",
        back_populates="application",
        cascade="all, delete-orphan",
    )


class CallbackRule(Base):
    __tablename__ = "callback_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    application_id = Column(
        Integer,
        ForeignKey(
            "third_party_applications.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    status = Column(
        String(20),
        default="ACTIVE",
        index=True,
    )
    priority = Column(Integer, default=100)
    trigger_event = Column(
        String(100),
        default="FDO_FINAL_DECISION",
    )
    run_when = Column(
        String(30),
        default="BOTH",
    )
    conditions_json = Column(Text, nullable=True)

    http_method = Column(
        String(15),
        default="POST",
    )
    url_mode = Column(
        String(20),
        default="INHERIT_BASE",
    )
    endpoint_path = Column(String(500), nullable=True)
    custom_url = Column(String(500), nullable=True)

    body_type = Column(
        String(30),
        default="JSON",
    )
    payload_source = Column(
        String(50),
        default="MAPPING",
    )
    stored_procedure_name = Column(
        String(200),
        nullable=True,
    )
    content_type = Column(
        String(100),
        default="application/json",
    )

    payload_mapping_json = Column(Text, nullable=True)
    raw_payload_template = Column(Text, nullable=True)
    query_params_json = Column(Text, nullable=True)
    headers_json = Column(Text, nullable=True)

    auth_override_type = Column(
        String(50),
        default="INHERIT",
    )
    auth_override_config_json = Column(Text, nullable=True)

    timeout_seconds = Column(Integer, default=30)
    success_criteria_json = Column(Text, nullable=True)
    follow_redirects = Column(Boolean, default=False)
    retry_config_json = Column(Text, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
    )
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    application = relationship(
        "ThirdPartyApplication",
        back_populates="rules",
    )
    events = relationship(
        "CallbackEvent",
        back_populates="rule",
        cascade="all, delete-orphan",
    )


class CallbackEvent(Base):
    __tablename__ = "callback_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(
        String(100),
        unique=True,
        index=True,
        nullable=False,
    )
    document_id = Column(
        String(100),
        ForeignKey("documents.id"),
        nullable=False,
        index=True,
    )
    rule_id = Column(
        Integer,
        ForeignKey("callback_rules.id"),
        nullable=False,
        index=True,
    )
    application_id = Column(
        Integer,
        ForeignKey("third_party_applications.id"),
        nullable=False,
        index=True,
    )

    source_primary_key = Column(String(100), nullable=True)
    document_number = Column(String(150), nullable=True)
    decision = Column(String(50), nullable=False)

    status = Column(
        String(50),
        default="PENDING",
        index=True,
    )
    attempt_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    next_retry_at = Column(DateTime, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )
    updated_at = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    document = relationship("Document")
    rule = relationship(
        "CallbackRule",
        back_populates="events",
    )
    application = relationship("ThirdPartyApplication")
    attempts = relationship(
        "CallbackAttempt",
        back_populates="callback_event",
        cascade="all, delete-orphan",
    )


class CallbackAttempt(Base):
    __tablename__ = "callback_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    callback_event_id = Column(
        Integer,
        ForeignKey(
            "callback_events.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    attempt_number = Column(Integer, nullable=False)

    http_method = Column(
        String(15),
        nullable=False,
    )
    request_url = Column(
        String(1000),
        nullable=False,
    )
    request_headers_json = Column(Text, nullable=True)
    request_body = Column(Text, nullable=True)

    response_status_code = Column(Integer, nullable=True)
    response_headers_json = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    response_time_ms = Column(Integer, nullable=True)

    status = Column(
        String(50),
        default="FAILED",
        index=True,
    )
    error_message = Column(Text, nullable=True)
    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )

    callback_event = relationship(
        "CallbackEvent",
        back_populates="attempts",
    )


class IntegrationAuditHistory(Base):
    __tablename__ = "integration_audit_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(
        String(50),
        nullable=False,
        index=True,
    )
    entity_id = Column(
        Integer,
        nullable=False,
        index=True,
    )
    action = Column(
        String(50),
        nullable=False,
    )
    previous_value_json = Column(Text, nullable=True)
    new_value_json = Column(Text, nullable=True)
    changed_by = Column(
        String(150),
        default="System Admin",
    )
    timestamp = Column(
        DateTime,
        default=datetime.datetime.utcnow,
        index=True,
    )