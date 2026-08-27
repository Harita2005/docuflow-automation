from typing import List, Optional, Any, Union
from pydantic import BaseModel, Field, model_validator
import datetime

# --- AUTH SCHEMAS ---
class LoginRequest(BaseModel):
    username: Optional[str] = None
    identifier: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    expires_in_minutes: Optional[int] = None
    force_login: bool = False
    device_info: Optional[str] = None

class TokenResponse(BaseModel):
    token: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    expires_in: Optional[int] = 3600
    user: Optional[dict] = None
    mfa_required: bool = False
    mfa_ticket: Optional[str] = None
    available_methods: Optional[List[str]] = None
    masked_email: Optional[str] = None
    masked_phone: Optional[str] = None
    has_authenticator_setup: bool = False
    active_session_conflict: bool = False
    active_device_info: Optional[str] = None
    session_created_at: Optional[str] = None
    session_id: Optional[str] = None
    message: Optional[str] = None

class MFASendOTPRequest(BaseModel):
    ticket: str
    method: str = "EMAIL" # EMAIL, SMS

class MFAVerifyRequest(BaseModel):
    ticket: str
    method: str # EMAIL, SMS, AUTHENTICATOR
    code: str
    force_login: bool = False
    device_info: Optional[str] = None

class MFASetupTOTPRequest(BaseModel):
    ticket: str

class MFASetupTOTPResponse(BaseModel):
    secret: str
    qr_svg_data_url: str
    provisioning_uri: str

class UserMasterCreate(BaseModel):
    employee_id: str = Field(..., description="Unique Employee ID (e.g. 16220, E22-02094)")
    employee_name: str = Field(..., description="Full Name of the Employee")
    username: Optional[str] = Field(None, description="Login handle (defaults to employee_id if omitted)")
    email: str = Field(..., description="Official Company Email")
    phone_number: Optional[str] = Field(None, description="Mobile number for SMS OTP")
    password: str = Field(..., description="Plain password (will be automatically bcrypt-hashed)")
    role: str = Field("employee", description="admin, manager, finance_auditor, employee")
    division: Optional[str] = Field("VCC", description="Company Division")
    department: Optional[str] = Field(None, description="Department (Finance, Audit, Operations)")
    plant: Optional[str] = Field(None, description="Assigned Plant / Branch (e.g. TN-SIVAKASI)")
    is_active: bool = Field(True, description="Active or Inactive status")
    mfa_enabled: bool = Field(False, description="Enable Multi-Factor Authentication")
    mfa_type: str = Field("EMAIL", description="SMS, EMAIL, AUTHENTICATOR")
    created_by: Optional[str] = Field("System Admin", description="Admin who created this user")

class UserMasterUpdate(BaseModel):
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None # If provided, will be bcrypt re-hashed
    role: Optional[str] = None
    division: Optional[str] = None
    department: Optional[str] = None
    plant: Optional[str] = None
    is_active: Optional[bool] = None
    mfa_enabled: Optional[bool] = None
    mfa_type: Optional[str] = None

class UserStatusToggleRequest(BaseModel):
    is_active: bool = Field(..., description="Set true to activate, false to deactivate")

class UserResponse(BaseModel):
    id: int
    user_uid: Optional[str] = None
    employee_id: str
    employee_name: str
    name: str
    username: str
    email: str
    phone_number: Optional[str] = None
    division: Optional[str] = "VCC"
    department: Optional[str] = None
    plant: Optional[str] = None
    role: str
    is_active: bool
    mfa_enabled: bool
    mfa_type: str
    created_by: Optional[str] = None
    created_on: Optional[datetime.datetime] = None
    created_at: Optional[datetime.datetime] = None
    last_login: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True

# --- INVOICE SCHEMAS ---
class InvoiceBase(BaseModel):
    vendor_name: Optional[str] = None
    vendor_code: Optional[str] = None
    vendor_gstin: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    po_number: Optional[str] = None
    amount: float = 0.0
    base_amount: float = 0.0
    tax_amount: float = 0.0
    currency: str = "INR"
    document_type: str = "AP INVOICE"
    division: str = "VCC"
    category: Optional[str] = None
    cost_center: Optional[str] = None
    plant: Optional[str] = None
    payment_terms: str = "Net 30"
    status: str = "Pending Approval"
    current_stage: int = 1
    total_stages: int = 2
    assigned_approver: Optional[str] = None
    workflow_profile_id: Optional[str] = None
    checklist_state: Optional[str] = None
    line_items_json: Optional[str] = None
    file_url: Optional[str] = None
    cgst: Optional[float] = 0.0
    sgst: Optional[float] = 0.0
    igst: Optional[float] = 0.0

class InvoiceCreate(InvoiceBase):
    id: Optional[str] = None

class InvoiceUpdate(BaseModel):
    vendor_name: Optional[str] = None
    vendor_gstin: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    po_number: Optional[str] = None
    amount: Optional[float] = None
    base_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    document_type: Optional[str] = None
    division: Optional[str] = None
    category: Optional[str] = None
    cost_center: Optional[str] = None
    plant: Optional[str] = None
    payment_terms: Optional[str] = None
    checklist_state: Optional[str] = None
    assigned_approver: Optional[str] = None
    notes: Optional[str] = None

class InvoiceActionRequest(BaseModel):
    decision: Optional[str] = "APPROVE" # "APPROVE", "REJECT", "HOLD"
    remarks: Optional[str] = None
    stage_name: Optional[str] = None

class InvoiceResponse(InvoiceBase):
    id: str
    doc_key: Optional[Union[str, int]] = None
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    is_current_approver: Optional[bool] = None
    has_approved: Optional[bool] = None
    has_rejected: Optional[bool] = None

    class Config:
        from_attributes = True

# --- WORKFLOW SCHEMAS ---
class WorkflowStepSchema(BaseModel):
    stage_number: int
    step_name: str
    approver_type: str = "Approval Pool"
    approver_target: Optional[str] = None
    delegate_approver: Optional[str] = None
    document_type: str = "AP INVOICE"
    action_required: str = "Approve"
    permissions: str = "Approve / Reject"
    sla_hours: int = 48
    checklist_items: Optional[List[str]] = []
    checklist_json: Optional[str] = None

    class Config:
        from_attributes = True

class WorkflowProfileSchema(BaseModel):
    profile_name: str
    workflow_code: Optional[str] = None
    workflow_category: str = "Vendor Payment Workflows"
    workflow_type: str = "AP INVOICE"
    description: Optional[str] = None
    status: str = "Active"
    approval_threshold: int = 100
    rejection_handling: str = "Return to Previous Step"
    reminder_interval_hours: int = 24
    escalation_after_hours: int = 48
    auto_escalation: bool = False
    rule_action: Optional[str] = "WORKFLOW_ROUTE"
    cancel_reason: Optional[str] = None
    auto_approve_enabled: Optional[bool] = False
    auto_approve_condition: Optional[str] = None
    auto_cancel_enabled: Optional[bool] = False
    auto_cancel_condition: Optional[str] = None
    steps: List[WorkflowStepSchema] = []

    class Config:
        from_attributes = True

# --- BUSINESS RULE SCHEMAS ---
class ConditionItem(BaseModel):
    field: str
    operator: str
    value: Any
    logicalOperator: Optional[str] = "AND"

class BusinessRuleSchema(BaseModel):
    id: Optional[int] = None
    rule_name: str
    rule_category: str = "Vendor Payment Workflows"
    document_type: str = "AP INVOICE"
    priority: int = 10
    target_workflow_id: str
    conditions_json: str
    description: Optional[str] = None
    rule_action: Optional[str] = "WORKFLOW_ROUTE"
    cancel_reason: Optional[str] = None
    auto_approve_enabled: Optional[bool] = False
    auto_approve_condition: Optional[str] = None
    auto_cancel_enabled: Optional[bool] = False
    auto_cancel_condition: Optional[str] = None
    is_active: bool = True

    class Config:
        from_attributes = True

# --- AUDIT SCHEMAS ---
class AuditLogResponse(BaseModel):
    id: int
    invoice_id: Optional[str] = Field(None, validation_alias="invoice_id")
    document_id: Optional[str] = Field(None, validation_alias="invoice_id")
    user: str
    action: str
    stage: Optional[str] = None
    notes: Optional[str] = Field(None, validation_alias="notes")
    details: Optional[str] = Field(None, validation_alias="notes")
    timestamp: datetime.datetime

    class Config:
        from_attributes = True
        populate_by_name = True

# --- ENTERPRISE DATA & ATTACHMENT SYNC SCHEMAS ---
class DocumentSyncRequest(BaseModel):
    # MS SQL DocTrans & ERP Keys
    doc_key: Optional[Union[str, int]] = Field(None, alias="DocKey", description="Unique ERP/MS SQL Primary Key for idempotent upsert")
    doc_num: Optional[Any] = Field(None, alias="DocNum", description="ERP Document Number")
    doc_entry: Optional[Any] = Field(None, alias="DocEntry", description="ERP Entry ID")
    company_code: Optional[str] = Field(None, alias="CompanyCode", description="Company / Division Code (e.g. VCC, ACC, ENES)")
    division: Optional[str] = Field("VCC", description="Company Division")
    
    # Classification
    document_type: str = Field("AP INVOICE", alias="TransType", description="AP INVOICE, AP DEBIT NOTE, AR CREDITNOTE, JOURNAL ENTRY")
    category: Optional[str] = Field(None, alias="Category", description="Expense Category")
    cost_center: Optional[str] = Field(None, alias="CostCenter", description="Cost Center Code/Name")
    plant: Optional[str] = Field(None, alias="Branch", description="Plant or Regional Branch (e.g. TN-SIVAKASI)")
    
    # Billing & Vendor
    vendor_name: Optional[str] = Field(None, alias="CardName", description="Vendor / Supplier Name")
    vendor_code: Optional[str] = Field(None, alias="CardCode", description="Vendor ERP Code")
    vendor_gstin: Optional[str] = Field(None, alias="GSTIN", description="Vendor 15-digit GSTIN")
    invoice_number: Optional[str] = Field(None, alias="DocRefNo", description="Vendor Invoice / Bill Ref No")
    document_number: Optional[str] = Field(None, description="General Document / Record Reference Number")
    invoice_date: Optional[str] = Field(None, alias="DocDate", description="Invoice Date (YYYY-MM-DD)")
    po_number: Optional[str] = Field(None, alias="PONumber", description="Purchase Order Reference")
    
    # Financials
    amount: float = Field(0.0, alias="DocTotal", description="Gross Amount Payable")
    base_amount: Optional[float] = Field(None, description="Base Taxable Amount")
    tax_amount: Optional[float] = Field(None, description="Tax / GST Amount")
    currency: str = Field("INR", description="Currency Code")
    payment_terms: str = Field("Net 30", description="Credit / Payment Terms")
    
    # Line Items & Custom Payload
    line_items: Optional[List[dict]] = Field(None, description="Line item objects breakdown")
    custom_data: Optional[dict] = Field(None, description="Additional arbitrary ERP custom attributes")
    auto_route: bool = Field(True, description="Immediately evaluate business rules and attach workflow")

    @model_validator(mode="before")
    @classmethod
    def populate_numbers(cls, data: Any) -> Any:
        if isinstance(data, dict):
            doc_num = data.get("document_number")
            inv_num = data.get("invoice_number") or data.get("DocRefNo")
            if doc_num and not inv_num:
                data["invoice_number"] = doc_num
                data["DocRefNo"] = doc_num
            elif inv_num and not doc_num:
                data["document_number"] = inv_num
        return data

    class Config:
        populate_by_name = True

class DocumentSyncResponse(BaseModel):
    success: bool
    message: str
    document_id: str
    doc_key: Optional[Union[str, int]] = None
    invoice_number: Optional[str] = None
    document_number: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: float
    division: str
    plant: Optional[str] = None
    workflow_profile_id: Optional[str] = None
    total_stages: int
    current_stage: int
    assigned_approver: Optional[str] = None
    status: str

class BatchSyncRequest(BaseModel):
    documents: List[DocumentSyncRequest]
    sync_source: Optional[str] = Field("ERP Integration Job", description="Name of the external syncing agent")

class BatchSyncItemResult(BaseModel):
    index: int
    document_id: Optional[str] = None
    doc_key: Optional[Union[str, int]] = None
    invoice_number: Optional[str] = None
    document_number: Optional[str] = None
    status: str # "SUCCESS" or "FAILED"
    error: Optional[str] = None

class BatchSyncResponse(BaseModel):
    total_received: int
    successful_count: int
    failed_count: int
    results: List[BatchSyncItemResult]

class Base64AttachmentSyncRequest(BaseModel):
    doc_key: Optional[Union[str, int]] = Field(None, alias="DocKey", description="Target ERP DocKey")
    invoice_id: Optional[str] = Field(None, description="Target DocuFlow Document ID (e.g. DOC-101)")
    file_name: str = Field(..., description="File name including extension (e.g. invoice_9912.pdf)")
    file_content_base64: str = Field(..., description="Base64 encoded binary file data")
    attachment_type: str = Field("Original Invoice", description="Original Invoice, PO Copy, GRN Receipt, Delivery Challan")
    uploaded_by: Optional[str] = Field("ERP AutoSync", description="System user or sync service name")

    class Config:
        populate_by_name = True

class AttachmentSyncResponse(BaseModel):
    success: bool
    message: str 
    document_id: str
    file_name: str
    file_url: str
    file_size_bytes: int
    ocr_extracted_fields: Optional[dict] = None

class NotificationProviderSchema(BaseModel):
    smtp_server: str
    port: int = 587
    username: Optional[str] = None
    encrypted_password: Optional[str] = None
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None

class NotificationRaciSchema(BaseModel):
    workflow_profile: str
    event_name: str
    responsible_emails: Optional[str] = None
    accountable_emails: Optional[str] = None
    consulted_emails: Optional[str] = None
    informed_emails: Optional[str] = None
    title_template: Optional[str] = None
    message_template: Optional[str] = None

class NotificationTestSchema(BaseModel):
    to: str
    subject: str
    html: str


# --- THIRD-PARTY & SAP INTEGRATION SCHEMAS ---
class ThirdPartyWebhookConfigCreate(BaseModel):
    name: Optional[str] = Field("Primary ERP Integration Endpoint", description="Descriptive name")
    target_url: str = Field(..., description="External Webhook / API URL to receive approved documents")
    auth_header_name: Optional[str] = Field("Authorization", description="e.g. Authorization or X-API-Key")
    auth_token: Optional[str] = Field(None, description="Bearer token or API key for the external endpoint")
    hmac_secret: Optional[str] = Field(None, description="Secret used to sign the X-DocuFlow-Signature header")
    is_active: Optional[bool] = Field(True, description="Enable or disable real-time push")
    retry_count: Optional[int] = Field(3, description="Number of retry attempts if target endpoint fails")

class ThirdPartyWebhookConfigResponse(ThirdPartyWebhookConfigCreate):
    id: int
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True

class ThirdPartyWebhookTestRequest(BaseModel):
    target_url: Optional[str] = None
    auth_header_name: Optional[str] = "Authorization"
    auth_token: Optional[str] = None
    hmac_secret: Optional[str] = None

class IntegrationAcknowledgmentRequest(BaseModel):
    external_system_name: str = Field(..., description="e.g. SAP S/4HANA, Tally Prime, Oracle, Zoho Books")
    external_reference_id: str = Field(..., description="External Transaction ID or SAP Accounting Doc #")
    notes: Optional[str] = Field(None, description="Optional posting notes or status details")
    posting_status: Optional[str] = Field("SYNCED", description="SYNCED or FAILED")

class IntegrationAcknowledgmentResponse(BaseModel):
    success: bool
    document_id: str
    external_sync_status: str
    external_sync_ref: Optional[str] = None
    external_synced_at: Optional[datetime.datetime] = None
    message: str



