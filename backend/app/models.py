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
    division = Column(String(100), default="VCC")
    department = Column(String(100), nullable=True)
    plant = Column(String(100), nullable=True) # Assigned Branch/Plant (e.g. TN-SIVAKASI)
    role = Column(String(100), default="employee") # admin, manager, finance_auditor, employee
    
    # Security & Password
    password_hash = Column(String(255), nullable=False) # Bcrypt hashed password
    is_active = Column(Boolean, default=True) # Active / Inactive status
    
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
    __tablename__ = "invoices"

    id = Column(String(100), primary_key=True, index=True) # e.g. "DOC-101" or string ID
    doc_key = Column(Integer, index=True, nullable=True)     # Matching MS SQL DocTrans.DocKey
    doc_num = Column(Integer, nullable=True)                 # MS SQL DocTrans.DocNum
    doc_date = Column(String(50), nullable=True)             # MS SQL DocTrans.DocDate
    
    # Billing & Financials
    vendor_name = Column(String(250), nullable=True)         # MS SQL DocTrans.CardName
    vendor_code = Column(String(100), nullable=True)         # MS SQL DocTrans.CardCode
    vendor_gstin = Column(String(50), nullable=True)         # MS SQL DocTrans.GSTIN
    invoice_number = Column(String(150), nullable=True)      # MS SQL DocTrans.DocRefNo
    invoice_date = Column(String(50), nullable=True)
    po_number = Column(String(100), nullable=True)
    amount = Column(Float, default=0.0)                      # MS SQL DocTrans.DocTotal
    base_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    currency = Column(String(20), default="INR")
    
    # Classification & Routing
    document_type = Column(String(100), default="AP INVOICE")# MS SQL DocTrans.TransType / DocTypeID
    division = Column(String(100), default="VCC")            # MS SQL DocTrans.CompanyCode
    category = Column(String(200), nullable=True)            # MS SQL DocTrans.Category
    cost_center = Column(String(200), nullable=True)
    plant = Column(String(200), nullable=True)               # Branch / Location
    payment_terms = Column(String(100), default="Net 30")
    
    # Workflow Progression
    status = Column(String(50), default="Pending Approval")  # Pending Approval, Approved, Rejected, Hold, Settled
    current_stage = Column(Integer, default=1)
    total_stages = Column(Integer, default=2)
    assigned_approver = Column(String(255), nullable=True)   # MS SQL DocTrans.WFAssignedToUserIDs
    workflow_profile_id = Column(String(200), nullable=True)
    
    # Checklists & Items JSON
    checklist_state = Column(Text, nullable=True)            # JSON of 9-point verification state
    line_items_json = Column(Text, nullable=True)            # Line items breakdown
    custom_data = Column(Text, nullable=True)                # Additional OCR/ERP payload
    file_url = Column(String(500), nullable=True)            # PDF file path
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class WorkflowProfile(Base):
    __tablename__ = "workflow_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(String(200), unique=True, index=True, nullable=False)
    workflow_code = Column(String(100), nullable=True)
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
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    steps = relationship("WorkflowStepDefinition", back_populates="profile", cascade="all, delete-orphan")

class WorkflowStepDefinition(Base):
    __tablename__ = "workflow_step_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_name = Column(String(200), ForeignKey("workflow_profiles.profile_name", ondelete="CASCADE"), nullable=False)
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
    target_workflow_id = Column(String(200), nullable=False)     # profile_name of target workflow
    conditions_json = Column(Text, nullable=False)               # JSON string of conditions array
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), index=True, nullable=False)
    user = Column(String(150), nullable=False)
    action = Column(String(100), nullable=False)                # Approved, Rejected, Held, Sync, Created
    stage = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(100), nullable=True)
    action = Column(String(150), nullable=False)
    user = Column(String(150), default="System Engine")
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
