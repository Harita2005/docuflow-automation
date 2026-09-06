from app.schemas.schemas import (
    LoginRequest, TokenResponse, MFASendOTPRequest, MFAVerifyRequest,
    MFASetupTOTPRequest, MFASetupTOTPResponse, UserMasterCreate, UserMasterUpdate,
    UserStatusToggleRequest, UserResponse, InvoiceBase, InvoiceCreate, InvoiceUpdate,
    InvoiceActionRequest, InvoiceResponse, WorkflowStepSchema, WorkflowProfileSchema,
    ConditionItem, BusinessRuleSchema, AuditLogResponse, DocumentSyncRequest,
    DocumentSyncResponse, BatchSyncRequest, BatchSyncItemResult, BatchSyncResponse,
    Base64AttachmentSyncRequest, AttachmentSyncResponse, NotificationProviderSchema,
    NotificationRaciSchema, NotificationTestSchema, ThirdPartyWebhookConfigCreate,
    ThirdPartyWebhookConfigResponse, ThirdPartyWebhookTestRequest,
    IntegrationAcknowledgmentRequest, IntegrationAcknowledgmentResponse,
    ThirdPartyApplicationCreate, ThirdPartyApplicationUpdate, ThirdPartyApplicationResponse,
    CallbackRuleCreate, CallbackRuleUpdate, CallbackRuleResponse, TestCallbackRequest
)

# Document aliases
DocumentSchema = InvoiceResponse
DocumentCreate = InvoiceCreate
DocumentUpdate = InvoiceUpdate

__all__ = [
    "LoginRequest", "TokenResponse", "MFASendOTPRequest", "MFAVerifyRequest",
    "MFASetupTOTPRequest", "MFASetupTOTPResponse", "UserMasterCreate", "UserMasterUpdate",
    "UserStatusToggleRequest", "UserResponse", "InvoiceBase", "InvoiceCreate", "InvoiceUpdate",
    "InvoiceActionRequest", "InvoiceResponse", "DocumentSchema", "DocumentCreate", "DocumentUpdate",
    "WorkflowStepSchema", "WorkflowProfileSchema", "ConditionItem", "BusinessRuleSchema",
    "AuditLogResponse", "DocumentSyncRequest", "DocumentSyncResponse", "BatchSyncRequest",
    "BatchSyncItemResult", "BatchSyncResponse", "Base64AttachmentSyncRequest",
    "AttachmentSyncResponse", "NotificationProviderSchema", "NotificationRaciSchema",
    "NotificationTestSchema", "ThirdPartyWebhookConfigCreate", "ThirdPartyWebhookConfigResponse",
    "ThirdPartyWebhookTestRequest", "IntegrationAcknowledgmentRequest",
    "IntegrationAcknowledgmentResponse", "ThirdPartyApplicationCreate",
    "ThirdPartyApplicationUpdate", "ThirdPartyApplicationResponse", "CallbackRuleCreate",
    "CallbackRuleUpdate", "CallbackRuleResponse", "TestCallbackRequest"
]
