import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Numeric
)
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_uid = Column(String(50), unique=True, index=True, nullable=True) # Auto-generated random UID (e.g. USR-782914)
    employee_id = Column(String(50), unique=True, index=True, nullable=False) # Unique Employee ID
    employee_name = Column(String(150), nullable=False) # Employee Full Name
    name = Column(String(150), nullable=False) # Alias for backward compatibility
    username = Column(String(150), unique=True, index=True, nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone_number = Column(String(20), nullable=True)
    
    # Department & Plant Assignment
    division = Column(String(100), default="VCC", index=True)
    department = Column(String(100), nullable=True)
    plant = Column(String(100), nullable=True, index=True) # Assigned Branch/Plant (e.g. TN-SIVAKASI)
    role = Column(String(100), default="employee", index=True) # admin, manager, finance_auditor, employee
    
    # Security & Password
    password_hash = Column(String(255), nullable=False) # Bcrypt hashed password
    is_active = Column(Boolean, default=True, index=True) # Active / Inactive status
    
    # Soft Deletes (Corporate Compliance)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    # MFA & OTP Security
    mfa_enabled = Column(Boolean, default=False)
    mfa_type = Column(String(50), default="EMAIL") # SMS, EMAIL, AUTHENTICATOR
    mfa_secret = Column(String(100), nullable=True)
    last_login = Column(DateTime, nullable=True)
    
    # Audit Metadata
    created_by = Column(String(150), default="System Admin")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_on = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Invoice(Base):
    __tablename__ = "documents"

    id = Column(String(100), primary_key=True, index=True) # e.g. "DOC-101" or string ID
    doc_key = Column(String(100), index=True, nullable=True)     # Matching MS SQL DocTrans.DocKey
    doc_num = Column(String(100), index=True, nullable=True)     # MS SQL DocTrans.DocNum
    doc_date = Column(String(50), nullable=True)             # MS SQL DocTrans.DocDate
    
    # Billing & Financials
    vendor_name = Column(String(250), nullable=True)         # MS SQL DocTrans.CardName
    vendor_code = Column(String(100), nullable=True, index=True)         # MS SQL DocTrans.CardCode
    vendor_gstin = Column(String(50), nullable=True)         # MS SQL DocTrans.GSTIN
    invoice_number = Column(String(150), nullable=True, index=True)      # MS SQL DocTrans.DocRefNo
    invoice_date = Column(String(50), nullable=True)
    po_number = Column(String(100), nullable=True, index=True)
    amount = Column(Float, default=0.0)                      # MS SQL DocTrans.DocTotal
    base_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    currency = Column(String(20), default="INR")
    
    # Classification & Routing
    document_type = Column(String(100), default="AP INVOICE")# MS SQL DocTrans.TransType / DocTypeID
    division = Column(String(100), default="VCC", index=True)            # MS SQL DocTrans.CompanyCode
    category = Column(String(200), nullable=True, index=True)            # MS SQL DocTrans.Category
    cost_center = Column(String(200), nullable=True, index=True)
    plant = Column(String(200), nullable=True, index=True)               # Branch / Location
    payment_terms = Column(String(100), default="Net 30")
    
    # Workflow Progression
    status = Column(String(50), default="Pending Approval", index=True)  # Pending Approval, Approved, Rejected, Hold, Settled
    current_stage = Column(Integer, default=1)
    total_stages = Column(Integer, default=2)
    assigned_approver = Column(String(255), nullable=True, index=True)   # MS SQL DocTrans.WFAssignedToUserIDs
    workflow_profile_id = Column(String(200), nullable=True, index=True)
    
    # Soft Deletes (Corporate Compliance)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    # Checklists & Items JSON
    checklist_state = Column(Text, nullable=True)            # JSON of 9-point verification state
    line_items_json = Column(Text, nullable=True)            # Line items breakdown
    custom_data = Column(Text, nullable=True)                # Additional OCR/ERP payload
    file_url = Column(String(500), nullable=True)            # PDF file path
    cgst = Column(Float, default=0.0, nullable=True)
    sgst = Column(Float, default=0.0, nullable=True)
    igst = Column(Float, default=0.0, nullable=True)

    # New ERP fields
    pi_indicator = Column(String(10), nullable=True)         # PIdicator
    trans_type = Column(String(20), nullable=True)           # TransType
    gstin = Column(String(15), nullable=True)                # GSTIN
    doc_status = Column(Integer, default=0, nullable=True)   # Status (Doc Status)
    doc_due_date = Column(String(50), nullable=True)         # DocDueDate (Due Date)
    contact_person = Column(String(100), nullable=True)      # ContactPerson
    pay_mode = Column(String(10), default="BANK", nullable=True)  # PayMode
    link_column = Column(String(500), nullable=True)         # LinkColumn

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    line_items = relationship("InvoiceLineItem", back_populates="invoice", cascade="all, delete-orphan")

class WorkflowProfile(Base):
    __tablename__ = "workflow_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(String(200), unique=True, index=True, nullable=False)
    workflow_code = Column(String(100), nullable=True, index=True)
    workflow_category = Column(String(100), default="Vendor Payment Workflows")
    workflow_type = Column(String(100), default="AP INVOICE")
    description = Column(Text, nullable=True)
    status = Column(String(50), default="Active")
    
    # Execution Settings
    approval_threshold = Column(Integer, default=100)
    rejection_handling = Column(String(100), default="Return to Previous Step")
    reminder_interval_hours = Column(Integer, default=24)
    escalation_after_hours = Column(Integer, default=48)
    auto_escalation = Column(Boolean, default=False)
    
    # Soft Deletes (Corporate Compliance)
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
    approver_target = Column(String(500), nullable=True)         # Comma separated users or single user
    delegate_approver = Column(String(200), nullable=True)
    document_type = Column(String(100), default="AP INVOICE")
    action_required = Column(String(100), default="Approve")
    permissions = Column(String(200), default="Approve / Reject")
    sla_hours = Column(Integer, default=48)

    profile = relationship("WorkflowProfile", back_populates="steps")

class BusinessRule(Base):
    __tablename__ = "business_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_name = Column(String(250), unique=True, index=True, nullable=False)
    rule_category = Column(String(100), default="Vendor Payment Workflows")
    document_type = Column(String(100), default="AP INVOICE")
    priority = Column(Integer, default=10)
    target_workflow_id = Column(String(200), nullable=False, index=True)     # profile_name of target workflow
    conditions_json = Column(Text, nullable=False)               # JSON string of conditions array
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    
    # Soft Deletes (Corporate Compliance)
    is_deleted = Column(Boolean, default=False, index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=True)
    user = Column(String(150), nullable=False, index=True)
    action = Column(String(100), nullable=False)                # Approved, Rejected, Held, Sync, Created
    stage = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    invoice = relationship("Invoice")

class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True)
    action = Column(String(150), nullable=False)
    user = Column(String(150), default="System Engine")
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    invoice = relationship("Invoice")

class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_profile = Column(String(200), index=True, nullable=False)
    stage_name = Column(String(200), index=True, nullable=False)
    item_text = Column(String(500), nullable=False)
    is_mandatory = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    sequence_order = Column(Integer, default=1)

class InvoiceChecklistState(Base):
    __tablename__ = "document_checklist_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    stage_name = Column(String(200), nullable=False)
    item_text = Column(String(500), nullable=False)
    is_checked = Column(Boolean, default=False)
    checked_by = Column(String(150), nullable=True)
    checked_at = Column(DateTime, nullable=True)

    invoice = relationship("Invoice")

# Normalize Invoice Line Items (Option 3 for Reporting & Scale)
class InvoiceLineItem(Base):
    __tablename__ = "document_line_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    description = Column(String(250), nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    warranty_text = Column(String(500), nullable=True)
    serial_numbers = Column(String(1000), nullable=True)

    invoice = relationship("Invoice", back_populates="line_items")

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

