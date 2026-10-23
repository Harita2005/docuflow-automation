from enum import Enum
from typing import Optional


class DocumentType(str, Enum):
    AP_INVOICE = "AP INVOICE"
    CUSTOMER_FEEDBACK = "CUSTOMER FEEDBACK"
    CUSTOMER_COMPLAINT = "CUSTOMER COMPLAINT"
    CREDIT_NOTE = "CREDIT NOTE"


CANONICAL_DOCUMENT_TYPES = {
    DocumentType.AP_INVOICE.value,
    DocumentType.CUSTOMER_FEEDBACK.value,
    DocumentType.CUSTOMER_COMPLAINT.value,
    DocumentType.CREDIT_NOTE.value,
}


FEEDBACK_ALIASES = {
    "FEEDBACK",
    "CUSTOMER FEEDBACK",
    "CUSTOMER_FEEDBACK",
    "CUSTOMERFEEDBACK",
    "CUSTOMER-FEEDBACK",
}

COMPLAINT_ALIASES = {
    "COMPLAINT",
    "CUSTOMER COMPLAINT",
    "CUSTOMER_COMPLAINT",
    "CUSTOMERCOMPLAINT",
    "CUSTOMER-COMPLAINT",
}

CREDIT_NOTE_ALIASES = {
    "CREDIT NOTE",
    "CREDIT_NOTE",
    "CREDITNOTE",
    "AR CREDITNOTE",
    "AR CREDIT NOTE",
    "AR_CREDIT_NOTE",
}

INVOICE_ALIASES = {
    "AP INVOICE",
    "AP_INVOICE",
    "APINVOICE",
    "INVOICE",
    "PURCHASE INVOICE",
}


def normalize_document_type(raw_val: Optional[str]) -> str:
    """
    Normalizes free-form or variant document type strings into canonical DocumentType values.
    Preserves exact casing for known canonical types, strips whitespace, and maps common aliases.
    """
    if not raw_val or not str(raw_val).strip():
        return DocumentType.AP_INVOICE.value

    clean = str(raw_val).strip().upper()

    if clean in FEEDBACK_ALIASES:
        return DocumentType.CUSTOMER_FEEDBACK.value

    if clean in COMPLAINT_ALIASES:
        return DocumentType.CUSTOMER_COMPLAINT.value

    if clean in CREDIT_NOTE_ALIASES:
        return DocumentType.CREDIT_NOTE.value

    if clean in INVOICE_ALIASES:
        return DocumentType.AP_INVOICE.value

    # If already a valid canonical value
    if clean in CANONICAL_DOCUMENT_TYPES:
        return clean

    return clean


def is_feedback_or_complaint(raw_val: Optional[str]) -> bool:
    """Returns True if the document type is canonical customer feedback or complaint."""
    norm = normalize_document_type(raw_val)
    return norm in (DocumentType.CUSTOMER_FEEDBACK.value, DocumentType.CUSTOMER_COMPLAINT.value)
