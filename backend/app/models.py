import datetime
import uuid
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Numeric, Index
)
from sqlalchemy.orm import relationship
from app.database import Base

# =========================================================================
# 1. USER & IDENTITY MANAGEMENT
# =========================================================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_uid = Column(String(50), unique=True, index=True, nullable=True) # e.g. USR-782914
    employee_id = Column(String(50), unique=True, index=True, nullable=False) # Unique Employee ID
    employee_name = Column(String(150), nullable=False) # Employee Full Name
    name = Column(String(150), nullable=False) # Alias for backward compatibility
    username = Column(String(150), unique=True, index=True, nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone_number = Column(String(20), nullable=True)
    
    # Department & Plant Assignment
    division = Column(String(100), default="VCC", index=True)
    department = Column(String(100), nullable=True)
    plant = Column(String(100), nullable=True, index=True) # Assigned Branch/Plant
    role = Column(String(100), default="employee", index=True) # admin, manager, finance_auditor, employee
    
    # Security & Password
    password_hash = Column(String(255), nullable=False) # Bcrypt hashed password
    is_active = Column(Boolean, default=True, index=True) # Active / Inactive status
    
    # Soft Deletes (Corporate Compliance)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    # MFA & Security
    mfa_enabled = Column(Boolean, default=False)
    mfa_type = Column(String(50), default="EMAIL") # SMS, EMAIL, AUTHENTICATOR
    mfa_secret = Column(String(100), nullable=True)
    last_login = Column(DateTime, nullable=True)
    
    # Active Device Session Tracking (Single Concurrent Session & Prompt/Kick)
    active_session_id = Column(String(100), nullable=True, index=True)
    active_device_info = Column(String(255), nullable=True)
    session_created_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)
    
    # Audit Metadata
    created_by = Column(String(150), default="System Admin")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# =========================================================================
# 2. UNIVERSAL DOCUMENT MASTER LEDGER
# =========================================================================
class Document(Base):
    __tablename__ = "documents"

    id = Column(String(100), primary_key=True, index=True) # e.g. "DOC-101"
    doc_key = Column(String(100), index=True, nullable=True)     # ERP DocKey
    doc_num = Column(String(100), index=True, nullable=True)     # ERP DocNum
    doc_date = Column(String(50), nullable=True)                 # ERP DocDate
    
    # External / Party Reference & Billing
    party_name = Column(String(250), nullable=True, index=True)  # Vendor / Customer / Employee Name
    party_code = Column(String(100), nullable=True, index=True)  # ERP CardCode
    party_tax_id = Column(String(50), nullable=True)             # GSTIN / Tax ID
    
    # Aliases for backward compatibility
    vendor_name = Column(String(250), nullable=True)
    vendor_code = Column(String(100), nullable=True, index=True)
    vendor_gstin = Column(String(50), nullable=True)
    invoice_number = Column(String(150), nullable=True, index=True) # Reference Number
    invoice_date = Column(String(50), nullable=True)
    po_number = Column(String(100), nullable=True, index=True)
    
    # Financials (Exact Numeric Decimal Precision)
    amount = Column(Numeric(18, 2), default=0.0, nullable=False)
    base_amount = Column(Numeric(18, 2), default=0.0, nullable=False)
    tax_amount = Column(Numeric(18, 2), default=0.0, nullable=False)
    cgst = Column(Numeric(18, 2), default=0.0, nullable=True)
    sgst = Column(Numeric(18, 2), default=0.0, nullable=True)
    igst = Column(Numeric(18, 2), default=0.0, nullable=True)
    currency = Column(String(20), default="INR")
    
    # Classification & Routing
    document_type = Column(String(100), default="AP INVOICE", index=True) # E-VOUCHER, AP INVOICE, DEBIT NOTE, CAPEX
    division = Column(String(100), default="VCC", index=True)             # Company Code
    category = Column(String(200), nullable=True, index=True)             # Operational Category
    cost_center = Column(String(200), nullable=True, index=True)
    plant = Column(String(200), nullable=True, index=True)                # Branch / Plant Location
    payment_terms = Column(String(100), default="Net 30")
    pay_mode = Column(String(20), default="BANK", nullable=True)
    
    # Workflow Progression
    status = Column(String(50), default="Pending Approval", index=True)   # Pending Approval, Approved, Rejected, Hold
    current_stage = Column(Integer, default=1)
    total_stages = Column(Integer, default=2)
    assigned_approver = Column(String(500), nullable=True, index=True)    # Active Approver Pool / User IDs
    workflow_profile_id = Column(String(200), nullable=True, index=True)
    
    # Soft Deletes (Corporate Compliance)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    # Attachments & Extended Payload
    checklist_state = Column(Text, nullable=True)                         # Fallback JSON checklist cache
    line_items_json = Column(Text, nullable=True)                         # Line items JSON
    custom_data = Column(Text, nullable=True)                             # Extended OCR / ERP payload
    file_url = Column(String(500), nullable=True)                         # Scanned PDF file URL
    
    # ERP Synchronization Metadata
    pi_indicator = Column(String(10), nullable=True)
    trans_type = Column(String(20), nullable=True)
    gstin = Column(String(15), nullable=True)
    doc_status = Column(Integer, default=0, nullable=True)
    doc_due_date = Column(String(50), nullable=True)
    contact_person = Column(String(100), nullable=True)
    link_column = Column(String(500), nullable=True)

    # 3rd-Party & SAP Integration Tracking
    external_sync_status = Column(String(50), default="UNSYNCED", index=True) # UNSYNCED, PENDING, SYNCED, FAILED
    external_sync_ref = Column(String(100), nullable=True, index=True)        # External SAP Doc # or 3rd-party ID
    external_synced_at = Column(DateTime, nullable=True)                     # Timestamp of confirmation
    external_sync_system = Column(String(100), nullable=True)                 # SAP_S4HANA, TALLY, ZOHO, WEBHOOK, etc.
    external_sync_error = Column(Text, nullable=True)                         # Last sync error details
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    line_items = relationship("DocumentLineItem", back_populates="document", cascade="all, delete-orphan")
    checklist_states = relationship("DocumentChecklistState", back_populates="document", cascade="all, delete-orphan")
    approval_logs = relationship("DocumentApprovalLog", back_populates="document", cascade="all, delete-orphan")

    # High-Performance Composite Indexes for 100+ daily documents
    __table_args__ = (
        Index('ix_documents_assigned_status', 'assigned_approver', 'status'),
        Index('ix_documents_division_status', 'division', 'status'),
        Index('ix_documents_created_status', 'created_at', 'status'),
    )

# Backward Compatibility Alias
Invoice = Document


# =========================================================================
# 3. DOCUMENT LINE ITEMS (NORMALIZED BREAKDOWN)
# =========================================================================
class DocumentLineItem(Base):
    __tablename__ = "document_line_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    description = Column(String(500), nullable=False)
    quantity = Column(Numeric(12, 2), default=1.0)
    unit_price = Column(Numeric(18, 2), default=0.0)
    amount = Column(Numeric(18, 2), default=0.0)
    item_code = Column(String(100), nullable=True)
    warranty_text = Column(String(500), nullable=True)
    serial_numbers = Column(String(1000), nullable=True)

    document = relationship("Document", back_populates="line_items")

# Backward Compatibility Alias
InvoiceLineItem = DocumentLineItem


# =========================================================================
# 4. WORKFLOW PROFILES & STEP STAGES
# =========================================================================
class WorkflowProfile(Base):
    __tablename__ = "workflow_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(String(200), unique=True, index=True, nullable=False)
    workflow_code = Column(String(100), nullable=True, index=True)
    workflow_category = Column(String(100), default="Vendor Payment Workflows")
    workflow_type = Column(String(100), default="AP INVOICE")
    description = Column(Text, nullable=True)
    status = Column(String(50), default="Active")
    
    # Execution Rules
    approval_threshold = Column(Integer, default=100)
    rejection_handling = Column(String(100), default="Return to Previous Step")
    reminder_interval_hours = Column(Integer, default=24)
    escalation_after_hours = Column(Integer, default=48)
    auto_escalation = Column(Boolean, default=False)
    rule_action = Column(String(50), default="WORKFLOW_ROUTE", index=True) # WORKFLOW_ROUTE, AUTO_APPROVE, AUTO_CANCEL
    cancel_reason = Column(Text, nullable=True)
    auto_approve_enabled = Column(Boolean, default=False)
    auto_approve_condition = Column(Text, nullable=True) # JSON condition, e.g. amount <= 5000
    auto_cancel_enabled = Column(Boolean, default=False)
    auto_cancel_condition = Column(Text, nullable=True) # JSON condition, e.g. amount > 100000
    
    # Soft Deletes
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    steps = relationship("WorkflowStepDefinition", back_populates="profile", cascade="all, delete-orphan")


class WorkflowStepDefinition(Base):
    __tablename__ = "workflow_step_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(String(200), ForeignKey("workflow_profiles.profile_name", ondelete="CASCADE"), index=True, nullable=False)
    stage_number = Column(Integer, nullable=False)
    step_name = Column(String(200), nullable=False)
    approver_type = Column(String(100), default="Approval Pool") # Approval Pool, Specific Employee, Role Based
    approver_target = Column(String(500), nullable=True)         # Comma separated corporate usernames
    delegate_approver = Column(String(200), nullable=True)
    document_type = Column(String(100), default="AP INVOICE")
    action_required = Column(String(100), default="Approve")
    permissions = Column(String(200), default="Approve / Reject")
    sla_hours = Column(Integer, default=48)
    checklist_json = Column(Text, nullable=True)                 # Stage-specific checklist items JSON

    profile = relationship("WorkflowProfile", back_populates="steps")


# =========================================================================
# 5. BUSINESS DECISION RULES (CONDITION MATRIX)
# =========================================================================
class BusinessRule(Base):
    __tablename__ = "business_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(250), unique=True, index=True, nullable=False)
    rule_category = Column(String(100), default="Vendor Payment Workflows")
    document_type = Column(String(100), default="AP INVOICE")
    priority = Column(Integer, default=10)
    target_workflow_id = Column(String(200), nullable=False, index=True) # profile_name of target workflow
    conditions_json = Column(Text, nullable=False)                       # 4-point condition array JSON
    description = Column(Text, nullable=True)
    rule_action = Column(String(50), default="WORKFLOW_ROUTE", index=True) # WORKFLOW_ROUTE, AUTO_APPROVE, AUTO_CANCEL
    cancel_reason = Column(Text, nullable=True)
    auto_approve_enabled = Column(Boolean, default=False)
    auto_approve_condition = Column(Text, nullable=True)
    auto_cancel_enabled = Column(Boolean, default=False)
    auto_cancel_condition = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    
    # Soft Deletes
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# =========================================================================
# 6. STAGE COMPLIANCE & CHECKLIST STATES
# =========================================================================
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
    division = Column(String(100), nullable=True)         # Division/Company
    category = Column(String(200), nullable=True)         # Category
    cost_center = Column(String(200), nullable=True)      # Cost Center
    branch = Column(String(200), nullable=True)           # Branch/Plant
    workflow_profile = Column(String(200), nullable=True)  # Workflow Profile
    stage_name = Column(String(200), nullable=False)      # Stage Name
    item_text = Column(String(500), nullable=False)       # Verification Requirement
    is_mandatory = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    sequence_order = Column(Integer, default=1)


class DocumentChecklistState(Base):
    __tablename__ = "document_checklist_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    stage_name = Column(String(200), nullable=False, index=True)
    item_text = Column(String(500), nullable=False)
    is_checked = Column(Boolean, default=False)
    checked_by = Column(String(150), nullable=True)
    checked_at = Column(DateTime, nullable=True)

    document = relationship("Document", back_populates="checklist_states")

# Backward Compatibility Alias
InvoiceChecklistState = DocumentChecklistState


# =========================================================================
# 7. LOG SEPARATION: USER ACCESS & SECURITY AUDIT LOGS
# =========================================================================
class UserAccessLog(Base):
    __tablename__ = "user_access_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(150), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True) # LOGIN_SUCCESS, LOGOUT, LOGIN_FAILED, MFA_VERIFIED, PASSWORD_CHANGED
    status = Column(String(20), default="SUCCESS", nullable=False) # SUCCESS, FAILED, BLOCKED
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    failure_reason = Column(String(250), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)


# =========================================================================
# 8. LOG SEPARATION: DOCUMENT APPROVAL & STAGE AUDIT TRAIL
# =========================================================================
class DocumentApprovalLog(Base):
    __tablename__ = "document_approval_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=True)
    user = Column(String(150), nullable=False, index=True)
    action = Column(String(100), nullable=False) # STAGE_APPROVED, FINAL_APPROVED, REJECTED, SENT_BACK, ON_HOLD, CHECKLIST_SIGNED, SYSTEM_SYNC
    stage = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    document = relationship("Document", back_populates="approval_logs")

# Backward Compatibility Alias
AuditLog = DocumentApprovalLog


# =========================================================================
# 9. LOG SEPARATION: SYSTEM & BACKGROUND ENGINE LOGS
# =========================================================================
class SystemEngineLog(Base):
    __tablename__ = "system_engine_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    module_name = Column(String(100), default="System Engine", index=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True)
    action = Column(String(150), nullable=False)
    user = Column(String(150), default="System Engine")
    log_level = Column(String(20), default="INFO", index=True) # INFO, WARNING, ERROR, CRITICAL
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    document = relationship("Document")

# Backward Compatibility Alias
SystemLog = SystemEngineLog


# =========================================================================
# 10. RACI NOTIFICATIONS & IN-APP ALERTS
# =========================================================================
class NotificationRaciMatrix(Base):
    __tablename__ = "notification_raci_matrices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_profile = Column(String(200), index=True, nullable=False)
    event_name = Column(String(100), index=True, nullable=False)
    responsible_emails = Column(Text, nullable=True) # JSON array of emails
    accountable_emails = Column(Text, nullable=True) # JSON array of emails
    consulted_emails = Column(Text, nullable=True)   # JSON array of emails
    informed_emails = Column(Text, nullable=True)    # JSON array of emails
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
    notification_id = Column(String(100), unique=True, index=True, default=lambda: f"NOTIF-{uuid.uuid4().hex[:8].upper()}")
    document_id = Column(String(100), index=True, nullable=False)
    recipient_handle = Column(String(200), index=True, nullable=False)
    notification_type = Column(String(50), default="PENDING_APPROVAL")
    title = Column(String(300), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# =========================================================================
# 11. THIRD-PARTY & SAP INTEGRATION CONFIGURATION & LOGS
# =========================================================================
class ThirdPartyWebhookConfig(Base):
    __tablename__ = "third_party_webhook_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), default="Primary ERP Integration Endpoint", nullable=False)
    target_url = Column(String(500), nullable=False)
    auth_header_name = Column(String(100), default="Authorization")
    auth_token = Column(String(500), nullable=True) # e.g. "Bearer ..." or "ApiKey ..."
    hmac_secret = Column(String(200), nullable=True) # Optional secret for signing X-DocuFlow-Signature
    is_active = Column(Boolean, default=True, index=True)
    events_json = Column(Text, default='["document.settled"]') # Events that trigger this webhook
    retry_count = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class IntegrationSyncLog(Base):
    __tablename__ = "integration_sync_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    sync_direction = Column(String(20), default="PUSH", index=True) # PUSH or PULL
    target_system = Column(String(100), default="WEBHOOK", index=True) # SAP_S4HANA, TALLY, ZOHO, WEBHOOK
    request_url = Column(String(500), nullable=True)
    status_code = Column(Integer, nullable=True)
    status = Column(String(50), default="PENDING", index=True) # SUCCESS, FAILED, PENDING
    external_reference = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    payload_snapshot = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    document = relationship("Document")


# =========================================================================
# 12. APPROVAL CALLBACK INTEGRATION ENGINE MODELS
# =========================================================================
class ThirdPartyApplication(Base):
    __tablename__ = "third_party_applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False) # e.g. PAYMENT_APP, ERP, FIN
    description = Column(Text, nullable=True)
    base_url = Column(String(500), nullable=False) # e.g. https://payment.example.com/api
    environment = Column(String(30), default="Production") # Development, Testing, UAT, Production
    status = Column(String(20), default="Active", index=True) # Active, Inactive
    auth_type = Column(String(50), default="None") # None, API_KEY, BEARER_TOKEN, BASIC_AUTH, OAUTH2
    auth_config_json = Column(Text, nullable=True) # JSON config for credentials / secrets
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rules = relationship("CallbackRule", back_populates="application", cascade="all, delete-orphan")


class CallbackRule(Base):
    __tablename__ = "callback_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    application_id = Column(Integer, ForeignKey("third_party_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="ACTIVE", index=True) # DRAFT, ACTIVE, INACTIVE
    priority = Column(Integer, default=100) # Lower number = higher priority evaluation
    trigger_event = Column(String(100), default="FDO_FINAL_DECISION") # Trigger
    run_when = Column(String(30), default="BOTH") # APPROVED, REJECTED, BOTH
    conditions_json = Column(Text, nullable=True) # Dynamic condition tree
    http_method = Column(String(15), default="POST") # GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
    url_mode = Column(String(20), default="INHERIT_BASE") # INHERIT_BASE, OVERRIDE
    endpoint_path = Column(String(500), nullable=True) # e.g. /v1/payment/{{documentNumber}}/approval
    custom_url = Column(String(500), nullable=True) # Used if url_mode == OVERRIDE
    body_type = Column(String(30), default="JSON") # NONE, JSON, XML, FORM_URLENCODED, MULTIPART, RAW_TEXT, SQL_PROCEDURE
    payload_source = Column(String(50), default="MAPPING") # MAPPING, RAW_TEMPLATE, SQL_PROCEDURE
    stored_procedure_name = Column(String(200), nullable=True) # e.g. sp_GetApprovalCallbackPayload
    content_type = Column(String(100), default="application/json")
    payload_mapping_json = Column(Text, nullable=True) # Table of fields mapping
    raw_payload_template = Column(Text, nullable=True) # Template for custom JSON/XML/text
    query_params_json = Column(Text, nullable=True) # Query parameter key/values
    headers_json = Column(Text, nullable=True) # Custom header key/values
    auth_override_type = Column(String(50), default="INHERIT") # INHERIT, NONE, API_KEY, BEARER_TOKEN, BASIC_AUTH, OAUTH2
    auth_override_config_json = Column(Text, nullable=True)
    timeout_seconds = Column(Integer, default=30)
    success_criteria_json = Column(Text, nullable=True) # Status codes e.g. [200, 201, 202, 204]
    follow_redirects = Column(Boolean, default=False)
    retry_config_json = Column(Text, nullable=True) # Mode, max_attempts, initial_delay, backoff, retryable_codes
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    application = relationship("ThirdPartyApplication", back_populates="rules")
    events = relationship("CallbackEvent", back_populates="rule", cascade="all, delete-orphan")


class CallbackEvent(Base):
    __tablename__ = "callback_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String(100), unique=True, index=True, nullable=False) # e.g. APPROVAL-INV1024-84932-APPROVED
    document_id = Column(String(100), ForeignKey("documents.id"), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("callback_rules.id"), nullable=False, index=True)
    application_id = Column(Integer, ForeignKey("third_party_applications.id"), nullable=False, index=True)
    source_primary_key = Column(String(100), nullable=True)
    document_number = Column(String(150), nullable=True)
    decision = Column(String(50), nullable=False) # APPROVED, REJECTED
    status = Column(String(50), default="PENDING", index=True) # PENDING, SENDING, DELIVERED, FAILED, RETRYING
    attempt_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    next_retry_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    document = relationship("Document")
    rule = relationship("CallbackRule", back_populates="events")
    application = relationship("ThirdPartyApplication")
    attempts = relationship("CallbackAttempt", back_populates="callback_event", cascade="all, delete-orphan")


class CallbackAttempt(Base):
    __tablename__ = "callback_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    callback_event_id = Column(Integer, ForeignKey("callback_events.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False)
    http_method = Column(String(15), nullable=False)
    request_url = Column(String(1000), nullable=False)
    request_headers_json = Column(Text, nullable=True) # Secret-masked headers snapshot
    request_body = Column(Text, nullable=True)
    response_status_code = Column(Integer, nullable=True)
    response_headers_json = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    status = Column(String(50), default="FAILED", index=True) # DELIVERED, FAILED
    error_message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    callback_event = relationship("CallbackEvent", back_populates="attempts")


class IntegrationAuditHistory(Base):
    __tablename__ = "integration_audit_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(50), nullable=False, index=True) # APPLICATION, RULE
    entity_id = Column(Integer, nullable=False, index=True)
    action = Column(String(50), nullable=False) # CREATED, UPDATED, ENABLED, DISABLED, DELETED
    previous_value_json = Column(Text, nullable=True)
    new_value_json = Column(Text, nullable=True)
    changed_by = Column(String(150), default="System Admin")
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)




