import json
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_active_user, get_current_user_optional
from app.database.connection import get_db
from app.database.models import (
    AuditLog,
    DocumentTypeFieldConfiguration,
    Invoice,
    SystemEngineLog,
    User,
)
from app.schemas.schemas import (
    MoreInfoConfigResponse,
    MoreInfoConfigSaveRequest,
    MoreInfoFieldConfigItem,
)
from app.services.rbac_service import check_permission

logger = logging.getLogger(__name__)

router = APIRouter(tags=["More Info Field Configuration"])


# ---------------------------------------------------------------------------
# Infrastructure / Internal columns — NEVER shown in Edit Fields for any doc type
# ---------------------------------------------------------------------------

EXCLUDED_COLUMNS: Set[str] = {
    "id",
    "is_deleted",
    "deleted_at",
    "custom_data",
    "checklist_state",
    "line_items_json",
    "file_url",
    "file_path",
    "file_name",
    "file_size",
    "password_hash",
    "workflow_profile_id",
    "assigned_approver",
    "current_stage",
    "total_stages",
    "version",
    "source_application",
    "external_sync_status",
    "external_sync_ref",
    "external_synced_at",
    "external_sync_system",
    "external_sync_error",
    "doc_status",
    "created_at",
    "updated_at",
    "status",
    "link_column",
    "category",           # internal workflow category, not user-facing field
}

# ---------------------------------------------------------------------------
# Comprehensive label/category/source mapping for ALL documents table columns
# ---------------------------------------------------------------------------

ALL_COLUMN_LABELS: Dict[str, Dict[str, str]] = {
    # --- Core document identity ---
    "doc_key":            {"label": "ERP Doc Key",           "category": "DOCUMENT REFERENCE",    "source": "ERP"},
    "doc_num":            {"label": "Document Number",       "category": "DOCUMENT REFERENCE",    "source": "ERP"},
    "doc_date":           {"label": "Document Date",         "category": "DOCUMENT REFERENCE",    "source": "Document"},

    # --- Party / vendor ---
    "party_name":         {"label": "Party Name",            "category": "VENDOR INFORMATION",    "source": "ERP"},
    "party_code":         {"label": "Party Code",            "category": "VENDOR INFORMATION",    "source": "ERP"},
    "party_tax_id":       {"label": "Party Tax ID (GSTIN)",  "category": "VENDOR INFORMATION",    "source": "ERP"},
    "vendor_name":        {"label": "Vendor Name",           "category": "VENDOR INFORMATION",    "source": "ERP"},
    "vendor_code":        {"label": "Vendor Code",           "category": "VENDOR INFORMATION",    "source": "ERP"},
    "vendor_gstin":       {"label": "Vendor GSTIN",          "category": "VENDOR INFORMATION",    "source": "ERP"},
    "gstin":              {"label": "GSTIN",                 "category": "VENDOR INFORMATION",    "source": "ERP"},

    # --- Invoice reference ---
    "invoice_number":     {"label": "Invoice Number",        "category": "INVOICE INFORMATION",   "source": "Document"},
    "invoice_date":       {"label": "Invoice Date",          "category": "INVOICE INFORMATION",   "source": "Document"},
    "po_number":          {"label": "PO Number",             "category": "PURCHASE ORDER",        "source": "ERP"},
    "doc_due_date":       {"label": "Due Date",              "category": "INVOICE INFORMATION",   "source": "ERP"},
    "pi_indicator":       {"label": "PI Indicator",          "category": "INVOICE INFORMATION",   "source": "ERP"},
    "trans_type":         {"label": "Transaction Type",      "category": "INVOICE INFORMATION",   "source": "ERP"},
    "contact_person":     {"label": "Contact Person",        "category": "INVOICE INFORMATION",   "source": "ERP"},

    # --- Financial ---
    "amount":             {"label": "Total Gross (₹)",       "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    "base_amount":        {"label": "Base / Taxable Amount", "category": "FINANCIAL INFORMATION", "source": "ERP"},
    "tax_amount":         {"label": "Tax Amount (GST)",      "category": "FINANCIAL INFORMATION", "source": "ERP"},
    "cgst":               {"label": "CGST",                  "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    "sgst":               {"label": "SGST",                  "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    "igst":               {"label": "IGST",                  "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    "currency":           {"label": "Currency",              "category": "FINANCIAL INFORMATION", "source": "ERP"},

    # --- Organization ---
    "division":           {"label": "Division / Company",    "category": "ORGANIZATION",          "source": "ERP"},
    "cost_center":        {"label": "Cost Center",           "category": "ORGANIZATION",          "source": "ERP"},
    "plant":              {"label": "Plant / Branch",        "category": "ORGANIZATION",          "source": "ERP"},

    # --- Payment ---
    "payment_terms":      {"label": "Payment Terms",         "category": "PAYMENT",               "source": "ERP"},
    "pay_mode":           {"label": "Payment Mode",          "category": "PAYMENT",               "source": "ERP"},

    # --- Customer Feedback / Complaint specific ---
    "account_name":       {"label": "Account Name",          "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "type_of_complaint":  {"label": "Type of Complaint",     "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "subtype_of_complaint": {"label": "Subtype of Complaint","category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "dealer_name":        {"label": "Dealer / Distributor",  "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "bp_code":            {"label": "Business Partner Code", "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "customer_code":      {"label": "Customer Code",         "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "bp_type":            {"label": "BP Type",               "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "feedback_date":      {"label": "Feedback Date",         "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "survey_date":        {"label": "Survey Date",           "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "additional_comments":{"label": "Additional Comments",   "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "image_1":            {"label": "Image 1",               "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "image_2":            {"label": "Image 2",               "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "image_3":            {"label": "Image 3",               "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "image_4":            {"label": "Image 4",               "category": "CUSTOMER FEEDBACK",     "source": "Document"},
    "image_5":            {"label": "Image 5",               "category": "CUSTOMER FEEDBACK",     "source": "Document"},

    # --- HR Expense specific ---
    "employee_name":      {"label": "Employee Name",         "category": "HR EXPENSE",            "source": "ERP"},
    "employee_id":        {"label": "Employee ID",           "category": "HR EXPENSE",            "source": "ERP"},
    "employee_division":  {"label": "Employee Division",     "category": "HR EXPENSE",            "source": "ERP"},
    "employee_segment":   {"label": "Employee Segment",      "category": "HR EXPENSE",            "source": "ERP"},
    "expense_type":       {"label": "Expense Type",          "category": "HR EXPENSE",            "source": "ERP"},
    "department":         {"label": "Department",            "category": "HR EXPENSE",            "source": "ERP"},
    "expense_date":       {"label": "Expense Date",          "category": "HR EXPENSE",            "source": "Document"},
    "receipt_number":     {"label": "Receipt Number",        "category": "HR EXPENSE",            "source": "Document"},

    # --- Credit / Debit Note specific ---
    "credit_note_number": {"label": "Credit Note Number",   "category": "CREDIT NOTE",           "source": "Document"},
    "reason_for_credit":  {"label": "Reason for Credit",    "category": "CREDIT NOTE",           "source": "Document"},
    "original_invoice_ref":{"label": "Original Invoice Ref","category": "CREDIT NOTE",           "source": "Document"},
    "credit_note_date":   {"label": "Credit Note Date",     "category": "CREDIT NOTE",           "source": "Document"},
    "credit_status":      {"label": "Credit Status",        "category": "CREDIT NOTE",           "source": "ERP"},

    # --- Document type label itself ---
    "document_type":      {"label": "Document Type",        "category": "DOCUMENT REFERENCE",    "source": "ERP"},
}

# ---------------------------------------------------------------------------
# Document-type column affinity — columns EXCLUSIVE to specific document types.
# Columns listed here will ONLY appear for those doc types.
# Columns NOT listed here are considered "universal" (visible for any doc type).
# ---------------------------------------------------------------------------

# Universal columns that belong to ALL document types (no affinity restriction)
UNIVERSAL_COLUMNS: Set[str] = {
    "doc_key", "doc_num", "doc_date", "document_type",
    "amount", "base_amount", "tax_amount", "cgst", "sgst", "igst", "currency",
    "division", "cost_center", "plant", "payment_terms", "pay_mode",
    "invoice_number", "invoice_date", "po_number", "doc_due_date",
    "vendor_name", "vendor_code", "vendor_gstin",
    "party_name", "party_code", "party_tax_id", "gstin",
    "pi_indicator", "trans_type", "contact_person",
}

# Columns that belong ONLY to specific document types (type-restricted)
COLUMN_DOC_TYPE_AFFINITY: Dict[str, Set[str]] = {
    # Customer Feedback / Complaint only
    "account_name":         {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "type_of_complaint":    {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "subtype_of_complaint": {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "dealer_name":          {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "bp_code":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "customer_code":        {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "bp_type":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "feedback_date":        {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "survey_date":          {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "additional_comments":  {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "image_1":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "image_2":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "image_3":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "image_4":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},
    "image_5":              {"CUSTOMER FEEDBACK", "CUSTOMER COMPLAINT"},

    # HR Expense only
    "employee_name":        {"HR EXPENSE"},
    "employee_id":          {"HR EXPENSE"},
    "employee_division":    {"HR EXPENSE"},
    "employee_segment":     {"HR EXPENSE"},
    "expense_type":         {"HR EXPENSE"},
    "department":           {"HR EXPENSE"},
    "expense_date":         {"HR EXPENSE"},
    "receipt_number":       {"HR EXPENSE"},

    # Credit / Debit Note only
    "credit_note_number":   {"CREDIT NOTE", "DEBIT NOTE"},
    "reason_for_credit":    {"CREDIT NOTE", "DEBIT NOTE"},
    "original_invoice_ref": {"CREDIT NOTE", "DEBIT NOTE"},
    "credit_note_date":     {"CREDIT NOTE", "DEBIT NOTE"},
    "credit_status":        {"CREDIT NOTE", "DEBIT NOTE"},
}


# ---------------------------------------------------------------------------
# Canonical Field Registry — hardcoded per-doc-type "configured" catalog
# (These remain as the admin-configurable set; dynamic discovery adds on top)
# ---------------------------------------------------------------------------

DOCUMENT_TYPE_ALLOWED_FIELDS: Dict[str, List[Dict[str, str]]] = {
    "CUSTOMER FEEDBACK": [
        {"field_key": "account_name",        "label": "Account Name",              "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "type_of_complaint",   "label": "Type of Complaint",         "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "dealer_name",         "label": "Dealer / Distributor Name", "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "bp_code",             "label": "Business Partner Code",     "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "customer_code",       "label": "Customer Code",             "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_name",       "label": "Employee Name",             "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_id",         "label": "Employee ID",               "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_division",   "label": "Employee Division",         "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_segment",    "label": "Employee Segment",          "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "survey_date",         "label": "Survey Date",               "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "subtype_of_complaint","label": "Subtype of Complaint",      "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "bp_type",             "label": "BP Type",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "feedback_date",       "label": "Feedback Date",             "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "invoice_number",      "label": "Invoice Number",            "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "additional_comments", "label": "Additional Comments",       "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_1",             "label": "Image 1",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_2",             "label": "Image 2",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_3",             "label": "Image 3",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_4",             "label": "Image 4",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_5",             "label": "Image 5",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
    ],
    "CUSTOMER COMPLAINT": [
        {"field_key": "account_name",        "label": "Account Name",              "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "type_of_complaint",   "label": "Type of Complaint",         "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "dealer_name",         "label": "Dealer / Distributor Name", "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "bp_code",             "label": "Business Partner Code",     "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "customer_code",       "label": "Customer Code",             "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_name",       "label": "Employee Name",             "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_id",         "label": "Employee ID",               "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_division",   "label": "Employee Division",         "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "employee_segment",    "label": "Employee Segment",          "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "survey_date",         "label": "Survey Date",               "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "subtype_of_complaint","label": "Subtype of Complaint",      "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "bp_type",             "label": "BP Type",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "feedback_date",       "label": "Feedback Date",             "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "invoice_number",      "label": "Invoice Number",            "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "additional_comments", "label": "Additional Comments",       "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_1",             "label": "Image 1",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_2",             "label": "Image 2",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_3",             "label": "Image 3",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_4",             "label": "Image 4",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
        {"field_key": "image_5",             "label": "Image 5",                   "category": "CUSTOMER FEEDBACK", "source": "Document"},
    ],
    "HR EXPENSE": [
        {"field_key": "employee_name",  "label": "Employee Name",  "category": "HR EXPENSE",            "source": "ERP"},
        {"field_key": "expense_type",   "label": "Expense Type",   "category": "HR EXPENSE",            "source": "ERP"},
        {"field_key": "department",     "label": "Department",     "category": "HR EXPENSE",            "source": "ERP"},
        {"field_key": "employee_id",    "label": "Employee ID",    "category": "HR EXPENSE",            "source": "ERP"},
        {"field_key": "expense_date",   "label": "Expense Date",   "category": "HR EXPENSE",            "source": "Document"},
        {"field_key": "receipt_number", "label": "Receipt Number", "category": "HR EXPENSE",            "source": "Document"},
        {"field_key": "amount",         "label": "Total Amount",   "category": "FINANCIAL INFORMATION", "source": "Calculated"},
        {"field_key": "currency",       "label": "Currency",       "category": "FINANCIAL INFORMATION", "source": "ERP"},
        {"field_key": "cost_center",    "label": "Cost Center",    "category": "ORGANIZATION",          "source": "ERP"},
        {"field_key": "payment_terms",  "label": "Payment Terms",  "category": "PAYMENT",               "source": "ERP"},
    ],
    "CREDIT NOTE": [
        {"field_key": "credit_note_number",  "label": "Credit Note Number",   "category": "CREDIT NOTE",           "source": "Document"},
        {"field_key": "reason_for_credit",   "label": "Reason For Credit",    "category": "CREDIT NOTE",           "source": "Document"},
        {"field_key": "original_invoice_ref","label": "Original Invoice Ref", "category": "CREDIT NOTE",           "source": "Document"},
        {"field_key": "credit_note_date",    "label": "Credit Note Date",     "category": "CREDIT NOTE",           "source": "Document"},
        {"field_key": "credit_status",       "label": "Credit Status",        "category": "CREDIT NOTE",           "source": "ERP"},
        {"field_key": "amount",              "label": "Credit Amount",        "category": "FINANCIAL INFORMATION", "source": "Calculated"},
        {"field_key": "base_amount",         "label": "Taxable Base",         "category": "FINANCIAL INFORMATION", "source": "ERP"},
        {"field_key": "tax_amount",          "label": "GST Tax Amount",       "category": "FINANCIAL INFORMATION", "source": "ERP"},
        {"field_key": "vendor_name",         "label": "Party / Customer Name","category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "vendor_code",         "label": "Party Code",           "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "vendor_gstin",        "label": "GSTIN",                "category": "VENDOR INFORMATION",    "source": "ERP"},
    ],
    "AP INVOICE": [
        {"field_key": "vendor_name",    "label": "Vendor Name",        "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "vendor_code",    "label": "Vendor Code",        "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "vendor_gstin",   "label": "Vendor GSTIN",       "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "party_name",     "label": "Party Name",         "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "party_code",     "label": "Party Code",         "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "party_tax_id",   "label": "Party Tax ID",       "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "gstin",          "label": "GSTIN",              "category": "VENDOR INFORMATION",    "source": "ERP"},
        {"field_key": "invoice_number", "label": "Invoice Number",     "category": "INVOICE INFORMATION",   "source": "Document"},
        {"field_key": "invoice_date",   "label": "Invoice Date",       "category": "INVOICE INFORMATION",   "source": "Document"},
        {"field_key": "doc_due_date",   "label": "Due Date",           "category": "INVOICE INFORMATION",   "source": "ERP"},
        {"field_key": "pi_indicator",   "label": "PI Indicator",       "category": "INVOICE INFORMATION",   "source": "ERP"},
        {"field_key": "trans_type",     "label": "Transaction Type",   "category": "INVOICE INFORMATION",   "source": "ERP"},
        {"field_key": "contact_person", "label": "Contact Person",     "category": "INVOICE INFORMATION",   "source": "ERP"},
        {"field_key": "po_number",      "label": "PO Number",          "category": "PURCHASE ORDER",        "source": "ERP"},
        {"field_key": "amount",         "label": "Total Gross (₹)",    "category": "FINANCIAL INFORMATION", "source": "Calculated"},
        {"field_key": "base_amount",    "label": "Base Taxable Amount","category": "FINANCIAL INFORMATION", "source": "ERP"},
        {"field_key": "tax_amount",     "label": "Tax Amount (GST)",   "category": "FINANCIAL INFORMATION", "source": "ERP"},
        {"field_key": "cgst",           "label": "CGST",               "category": "FINANCIAL INFORMATION", "source": "Calculated"},
        {"field_key": "sgst",           "label": "SGST",               "category": "FINANCIAL INFORMATION", "source": "Calculated"},
        {"field_key": "igst",           "label": "IGST",               "category": "FINANCIAL INFORMATION", "source": "Calculated"},
        {"field_key": "currency",       "label": "Currency",           "category": "FINANCIAL INFORMATION", "source": "ERP"},
        {"field_key": "cost_center",    "label": "Cost Center",        "category": "ORGANIZATION",          "source": "ERP"},
        {"field_key": "plant",          "label": "Plant Location",     "category": "ORGANIZATION",          "source": "ERP"},
        {"field_key": "division",       "label": "Division / Branch",  "category": "ORGANIZATION",          "source": "ERP"},
        {"field_key": "payment_terms",  "label": "Payment Terms",      "category": "PAYMENT",               "source": "ERP"},
        {"field_key": "pay_mode",       "label": "Payment Mode",       "category": "PAYMENT",               "source": "ERP"},
        {"field_key": "doc_key",        "label": "ERP Doc Key",        "category": "DOCUMENT REFERENCE",    "source": "ERP"},
        {"field_key": "doc_num",        "label": "ERP Doc Number",     "category": "DOCUMENT REFERENCE",    "source": "ERP"},
        {"field_key": "doc_date",       "label": "Document Date",      "category": "DOCUMENT REFERENCE",    "source": "ERP"},
        {"field_key": "document_type",  "label": "Document Type",      "category": "DOCUMENT REFERENCE",    "source": "ERP"},
    ],
}

# Standard Field Catalog flattened for lookup (used when saving configs)
STANDARD_FIELD_CATALOG: List[Dict[str, Any]] = [
    item for cat_items in DOCUMENT_TYPE_ALLOWED_FIELDS.values() for item in cat_items
]
STANDARD_FIELD_MAP = {f["field_key"]: f for f in STANDARD_FIELD_CATALOG}

# Built-in Top 3 Default Fields per Document Type (Admin Defaults)
DEFAULT_ADMIN_TOP3_FIELDS: Dict[str, List[str]] = {
    "CUSTOMER FEEDBACK":  ["account_name", "type_of_complaint", "dealer_name"],
    "CUSTOMER COMPLAINT": ["account_name", "type_of_complaint", "dealer_name"],
    "HR EXPENSE":         ["employee_name", "expense_type", "department"],
    "CREDIT NOTE":        ["credit_note_number", "reason_for_credit", "original_invoice_ref"],
    "AP INVOICE":         ["vendor_name", "vendor_gstin", "payment_terms"],
}

DEFAULT_FALLBACK_FIELDS = ["vendor_name", "vendor_gstin", "payment_terms"]


def normalize_doc_type(doc_type: Optional[str]) -> str:
    if not doc_type:
        return "AP INVOICE"
    cleaned = doc_type.strip().upper()
    return cleaned if cleaned else "AP INVOICE"


def extract_custom_data_dict(doc: Invoice) -> Dict[str, Any]:
    return _parse_custom_data(doc)


def format_field_value(raw: Any, field_key: str) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        if any(w in field_key for w in ("amount", "total", "gst", "tax", "price", "base", "cgst", "sgst", "igst")):
            return f"INR {raw:,.2f}"
        return str(raw)
    s = str(raw).strip()
    return s if s else None


def get_field_value_from_document(doc: Optional[Invoice], field_key: str, custom_dict: Dict[str, Any] = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (formatted_value, raw_value_str) from real SQL columns first,
    then falls back to custom_data if the column has no value.
    """
    if not doc:
        return None, None

    if field_key == "taxable_amount":
        gross_amt = float(doc.amount or 0.0)
        base_taxable_amt = float(doc.base_amount or (round(gross_amt / 1.18, 2) if gross_amt > 0 else 0.0))
        if base_taxable_amt > 0:
            return f"INR {base_taxable_amt:,.2f}", str(base_taxable_amt)
    elif field_key == "tax_amount":
        gross_amt = float(doc.amount or 0.0)
        base_taxable_amt = float(doc.base_amount or (round(gross_amt / 1.18, 2) if gross_amt > 0 else 0.0))
        gst_tax_amt = float(doc.tax_amount or (round(gross_amt - base_taxable_amt, 2) if gross_amt > 0 else 0.0))
        if gst_tax_amt > 0:
            return f"INR {gst_tax_amt:,.2f}", str(gst_tax_amt)
    elif field_key == "amount":
        gross_amt = float(doc.amount or 0.0)
        if gross_amt > 0:
            return f"INR {gross_amt:,.2f}", str(gross_amt)

    # Check direct real SQL column attribute on Invoice instance
    raw = getattr(doc, field_key, None)
    if raw is not None and str(raw).strip() != "":
        formatted = format_field_value(raw, field_key)
        return formatted, str(raw)

    # Fallback: check custom_data JSON
    cd = _parse_custom_data(doc)
    if field_key in cd:
        val = cd[field_key]
        formatted = format_field_value(val, field_key)
        return formatted, str(val)
    # Try case-insensitive / underscore match
    normalized = field_key.lower().replace(" ", "_").replace("-", "_")
    for k, v in cd.items():
        k_norm = k.lower().replace(" ", "_").replace("-", "_")
        if k_norm == normalized and v is not None and str(v).strip():
            formatted = format_field_value(v, field_key)
            return formatted, str(v)

    return None, None


def _is_column_allowed_for_doc_type(col_name: str, norm_type: str) -> bool:
    """
    Returns True if the column is visible for the given document type.
    All real database columns and configured columns are allowed for any document type.
    """
    return True


def _get_live_db_columns(db: Optional[Session]) -> List[str]:
    """
    Queries the live DB for all column names on the `documents` table.
    Captures dynamically ALTER TABLE'd columns added at sync time that are
    not in the SQLAlchemy ORM model definition.
    """
    if not db:
        return []
    try:
        from sqlalchemy import text
        dialect = None
        try:
            dialect = db.bind.dialect.name if db.bind else None
        except Exception as exc:
            logger.debug("Failed getting dialect name: %s", exc)
        if dialect == "mssql":
            rows = db.execute(text(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = 'documents' ORDER BY ORDINAL_POSITION"
            )).fetchall()
            return [row[0] for row in rows]
        else:
            rows = db.execute(text("PRAGMA table_info(documents)")).fetchall()
            return [row[1] for row in rows]
    except Exception as exc:
        logger.debug("Could not query live DB columns: %s", exc)
        return []


def _parse_custom_data(doc: Invoice) -> Dict[str, Any]:
    """
    Parses the custom_data JSON blob and returns a flat dict of
    key → value for all non-null, non-empty entries.
    """
    raw_cd = getattr(doc, "custom_data", None)
    if not raw_cd:
        return {}
    try:
        cd = json.loads(raw_cd) if isinstance(raw_cd, str) else (raw_cd if isinstance(raw_cd, dict) else {})
        if not isinstance(cd, dict):
            return {}
        return {k: v for k, v in cd.items() if v is not None and str(v).strip() not in ("", "null")}
    except Exception:
        return {}


def _make_field_item(
    field_key: str,
    label: str,
    category: str,
    source: str,
    sample_value: Optional[str],
) -> MoreInfoFieldConfigItem:
    return MoreInfoFieldConfigItem(
        field_key=field_key,
        label=label,
        category=category,
        source=source,
        sample_value=sample_value,
        display_order=0,
        is_visible=True,
    )


def discover_available_fields_for_doc(
    doc: Invoice,
    db: Optional[Session] = None,
) -> List[MoreInfoFieldConfigItem]:
    """
    Fully dynamic 4-layer field discovery. Every field synced into this document
    appears in Edit Fields automatically — no manual admin config needed.

    LAYER 1 — Configured catalog: Hardcoded per-doc-type standard fields, always present.
    LAYER 2 — ORM model SQL columns: Every Invoice.__table__ column with a non-null value.
    LAYER 3 — Dynamic ALTER TABLE columns: Extra columns auto-created at sync time via
              ALTER TABLE that live in the DB but are NOT in the ORM model. Discovered by
              querying INFORMATION_SCHEMA live via the `db` session.
    LAYER 4 — custom_data JSON fallback: Arbitrary ERP key-value pairs stored in the
              custom_data blob that the sync engine couldn't map to a SQL column.
    """
    norm_type = normalize_doc_type(doc.document_type)

    # Auto-detect doc type from column hints when type is unknown/new
    if norm_type not in DOCUMENT_TYPE_ALLOWED_FIELDS:
        if getattr(doc, "type_of_complaint", None) or getattr(doc, "account_name", None):
            norm_type = "CUSTOMER COMPLAINT"
        elif getattr(doc, "expense_type", None) or getattr(doc, "department", None):
            norm_type = "HR EXPENSE"
        elif getattr(doc, "credit_note_number", None) or getattr(doc, "reason_for_credit", None):
            norm_type = "CREDIT NOTE"
        else:
            norm_type = "AP INVOICE"

    fields_result: List[MoreInfoFieldConfigItem] = []
    seen_keys: Set[str] = set()       # normalized (lower) keys for dedup
    seen_raw_keys: Set[str] = set()   # original-case keys for dedup

    # -------------------------------------------------------------------
    # LAYER 1: Configured catalog — always included, order preserved
    # -------------------------------------------------------------------
    configured_catalog = DOCUMENT_TYPE_ALLOWED_FIELDS.get(
        norm_type,
        DOCUMENT_TYPE_ALLOWED_FIELDS.get("AP INVOICE", [])
    )
    for item in configured_catalog:
        key = item["field_key"]
        key_norm = key.lower()
        if key_norm in seen_keys:
            continue
        seen_keys.add(key_norm)
        seen_raw_keys.add(key)
        formatted_val, _ = get_field_value_from_document(doc, key)
        fields_result.append(_make_field_item(
            field_key=key,
            label=item["label"],
            category=item["category"],
            source=item["source"],
            sample_value=formatted_val,
        ))

    # -------------------------------------------------------------------
    # LAYER 2: ORM model SQL columns with non-null values on this doc
    # -------------------------------------------------------------------
    try:
        orm_columns = [col.name for col in Invoice.__table__.columns]
    except Exception:
        orm_columns = []

    for col_name in orm_columns:
        col_norm = col_name.lower()
        if col_norm in seen_keys or col_name in seen_raw_keys:
            continue
        if col_name in EXCLUDED_COLUMNS or col_norm in EXCLUDED_COLUMNS:
            continue
        if not _is_column_allowed_for_doc_type(col_norm, norm_type):
            continue
        raw_val = getattr(doc, col_name, None)
        if raw_val is None:
            continue
        str_val = str(raw_val).strip()
        if not str_val or str_val.lower() == "null":
            continue
        # Skip bare zeros for non-financial fields
        if str_val in ("0", "0.0", "0.00"):
            meta_chk = ALL_COLUMN_LABELS.get(col_norm, {})
            if meta_chk.get("category") != "FINANCIAL INFORMATION":
                continue

        meta = ALL_COLUMN_LABELS.get(col_norm, ALL_COLUMN_LABELS.get(col_name, {}))
        label = meta.get("label") or col_name.replace("_", " ").title()
        col_category = meta.get("category") or "ADDITIONAL INFORMATION"
        source = meta.get("source") or "ERP"
        formatted_val = format_field_value(raw_val, col_name)
        seen_keys.add(col_norm)
        seen_raw_keys.add(col_name)
        fields_result.append(_make_field_item(col_name, label, col_category, source, formatted_val))

    # -------------------------------------------------------------------
    # LAYER 3: Dynamic ALTER TABLE columns — exist in DB but NOT in ORM
    # -------------------------------------------------------------------
    if db is not None:
        try:
            live_db_cols = _get_live_db_columns(db)
            orm_col_set_norm = {c.lower() for c in orm_columns}
            for col_name in live_db_cols:
                col_norm = col_name.lower()
                if col_norm in seen_keys or col_name in seen_raw_keys:
                    continue
                if col_norm in orm_col_set_norm:
                    continue  # Already handled in Layer 2
                if col_name in EXCLUDED_COLUMNS or col_norm in EXCLUDED_COLUMNS:
                    continue
                # Read value directly via raw SQL since ORM doesn't know this column
                raw_val = None
                try:
                    from sqlalchemy import text as _text
                    row = db.execute(
                        _text(f"SELECT [{col_name}] FROM documents WHERE id = :doc_id"),
                        {"doc_id": str(doc.id)}
                    ).fetchone()
                    raw_val = row[0] if row else None
                except Exception:
                    continue
                if raw_val is None:
                    continue
                str_val = str(raw_val).strip()
                if not str_val or str_val.lower() == "null":
                    continue

                meta = ALL_COLUMN_LABELS.get(col_norm, ALL_COLUMN_LABELS.get(col_name, {}))
                label = meta.get("label") or col_name.replace("_", " ").title()
                col_category = meta.get("category") or "SYNCED DATA"
                source = meta.get("source") or "ERP"
                formatted_val = format_field_value(raw_val, col_name)
                seen_keys.add(col_norm)
                seen_raw_keys.add(col_name)
                fields_result.append(_make_field_item(col_name, label, col_category, source, formatted_val))
        except Exception as exc:
            logger.debug("Layer 3 dynamic column discovery error: %s", exc)

    # -------------------------------------------------------------------
    # LAYER 4: custom_data JSON fallback — arbitrary ERP fields not in SQL
    # -------------------------------------------------------------------
    try:
        custom_dict = _parse_custom_data(doc)
        for raw_key, raw_val in custom_dict.items():
            raw_key_norm = raw_key.strip().lower().replace(" ", "_").replace("-", "_")
            if raw_key_norm in seen_keys or raw_key in seen_raw_keys:
                continue
            if raw_key_norm in EXCLUDED_COLUMNS or raw_key in EXCLUDED_COLUMNS:
                continue
            str_val = str(raw_val).strip()
            if not str_val or str_val.lower() == "null":
                continue
            # Use raw_key as field_key — document API promotes custom_data keys as-is to top-level
            meta = ALL_COLUMN_LABELS.get(raw_key_norm, ALL_COLUMN_LABELS.get(raw_key, {}))
            label = meta.get("label") or raw_key.replace("_", " ").replace("-", " ").title()
            col_category = meta.get("category") or "SYNCED DATA"
            source = meta.get("source") or "ERP"
            formatted_val = format_field_value(raw_val, raw_key_norm)
            seen_keys.add(raw_key_norm)
            seen_raw_keys.add(raw_key)
            fields_result.append(_make_field_item(raw_key, label, col_category, source, formatted_val))
    except Exception as exc:
        logger.debug("Layer 4 custom_data discovery error: %s", exc)

    return fields_result




def resolve_effective_configuration(
    db: Session,
    doc_type: str,
    user: Optional[User],
    available_fields: List[MoreInfoFieldConfigItem],
) -> Tuple[List[MoreInfoFieldConfigItem], List[MoreInfoFieldConfigItem], List[MoreInfoFieldConfigItem], str, bool]:

    """
    Returns (admin_defaults, user_selected, combined_selected, scope, has_user_override).
    - Admin Defaults: Exactly TOP 3 default fields for doc_type (user_id IS NULL) or built-in schema Top 3.
    - User Selected: Additional fields configured by user (user_id = user.id) that are NOT already in Admin Defaults (deduplicated).
    - Combined Selected: Admin Defaults + User Selected.
    """
    norm_type = normalize_doc_type(doc_type)
    fallback_type = norm_type
    if fallback_type not in DEFAULT_ADMIN_TOP3_FIELDS and available_fields:
        cat = available_fields[0].category
        if cat in DEFAULT_ADMIN_TOP3_FIELDS:
            fallback_type = cat
        else:
            fallback_type = "AP INVOICE"
    avail_map = {f.field_key: f for f in available_fields}

    # 1. Fetch Admin Default Fields (user_id IS NULL)
    admin_default_configs = (
        db.query(DocumentTypeFieldConfiguration)
        .filter(
            DocumentTypeFieldConfiguration.document_type == norm_type,
            DocumentTypeFieldConfiguration.user_id.is_(None),
            DocumentTypeFieldConfiguration.is_visible == True,
        )
        .order_by(DocumentTypeFieldConfiguration.display_order.asc())
        .all()
    )

    admin_defaults: List[MoreInfoFieldConfigItem] = []
    admin_default_keys: Set[str] = set()

    if admin_default_configs:
        for cfg in admin_default_configs:
            base = avail_map.get(cfg.field_key)
            item = MoreInfoFieldConfigItem(
                field_key=cfg.field_key,
                label=cfg.field_label or (base.label if base else cfg.field_key.replace("_", " ").title()),
                category=cfg.category or (base.category if base else norm_type),
                source=cfg.source or (base.source if base else "Document"),
                display_order=cfg.display_order,
                is_visible=True,
                is_admin_default=True,
                is_user_selected=False,
                sample_value=base.sample_value if base else None,
            )
            admin_defaults.append(item)
            admin_default_keys.add(cfg.field_key)
    else:
        top3_keys = DEFAULT_ADMIN_TOP3_FIELDS.get(norm_type, DEFAULT_ADMIN_TOP3_FIELDS.get(fallback_type, DEFAULT_FALLBACK_FIELDS))
        for idx, key in enumerate(top3_keys[:3]):
            base = avail_map.get(key)
            if base:
                item_copy = base.model_copy()
                item_copy.display_order = idx + 1
                item_copy.is_visible = True
                item_copy.is_admin_default = True
                item_copy.is_user_selected = False
                admin_defaults.append(item_copy)
                admin_default_keys.add(key)
            elif key in STANDARD_FIELD_MAP:
                s = STANDARD_FIELD_MAP[key]
                admin_defaults.append(
                    MoreInfoFieldConfigItem(
                        field_key=key,
                        label=s["label"],
                        category=s["category"],
                        source=s["source"],
                        display_order=idx + 1,
                        is_visible=True,
                        is_admin_default=True,
                        is_user_selected=False,
                        sample_value=None,
                    )
                )
                admin_default_keys.add(key)

    # 2. Fetch User Selected Fields (user_id = user.id)
    user_selected: List[MoreInfoFieldConfigItem] = []
    has_user_override = False

    if user and user.id:
        user_configs = (
            db.query(DocumentTypeFieldConfiguration)
            .filter(
                DocumentTypeFieldConfiguration.document_type == norm_type,
                DocumentTypeFieldConfiguration.user_id == user.id,
                DocumentTypeFieldConfiguration.is_visible == True,
            )
            .order_by(DocumentTypeFieldConfiguration.display_order.asc())
            .all()
        )
        if user_configs:
            has_user_override = True
            for cfg in user_configs:
                if cfg.field_key in admin_default_keys:
                    continue
                base = avail_map.get(cfg.field_key)
                item = MoreInfoFieldConfigItem(
                    field_key=cfg.field_key,
                    label=cfg.field_label or (base.label if base else cfg.field_key.replace("_", " ").title()),
                    category=cfg.category or (base.category if base else norm_type),
                    source=cfg.source or (base.source if base else "Document"),
                    display_order=cfg.display_order,
                    is_visible=True,
                    is_admin_default=False,
                    is_user_selected=True,
                    sample_value=base.sample_value if base else None,
                )
                user_selected.append(item)

    # 3. Combine: If user override exists, effective selected fields are user_selected. Otherwise admin_defaults.
    if has_user_override:
        combined = list(user_selected)
    else:
        combined = list(admin_defaults)
    scope = "USER" if has_user_override else "GLOBAL"

    return admin_defaults, user_selected, combined, scope, has_user_override


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get("/api/document-types/{document_type}/more-info/config", response_model=MoreInfoConfigResponse)
def get_doc_type_more_info_config(
    document_type: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    norm_type = normalize_doc_type(document_type)
    sample_doc = (
        db.query(Invoice)
        .filter(Invoice.document_type == norm_type, Invoice.is_deleted == False)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    if sample_doc:
        available_fields = discover_available_fields_for_doc(sample_doc, db=db)
    else:
        # No document found for this type — use full configured catalog
        catalog = DOCUMENT_TYPE_ALLOWED_FIELDS.get(norm_type, DOCUMENT_TYPE_ALLOWED_FIELDS.get("AP INVOICE", []))
        available_fields = [
            MoreInfoFieldConfigItem(
                field_key=item["field_key"],
                label=item["label"],
                category=item["category"],
                source=item["source"],
                display_order=0,
                is_visible=True,
                sample_value=None,
            )
            for item in catalog
        ]

    admin_defaults, user_selected, combined, scope, has_user_override = resolve_effective_configuration(
        db, norm_type, current_user, available_fields
    )

    is_admin = False
    if current_user:
        u_role = (current_user.role or "").lower().strip()
        is_admin = u_role in ["admin", "administrator", "system_admin", "superadmin"] or check_permission(
            current_user, "role:manage", db
        )

    return MoreInfoConfigResponse(
        document_type=norm_type,
        scope=scope,
        has_user_override=has_user_override,
        can_manage_default=is_admin,
        admin_default_fields=admin_defaults,
        user_selected_fields=user_selected,
        selected_fields=combined,
        available_fields=available_fields,
    )


@router.get("/api/documents/{document_id}/more-info/config", response_model=MoreInfoConfigResponse)
@router.get("/api/invoices/{document_id}/more-info/config", response_model=MoreInfoConfigResponse)
def get_document_more_info_config(
    document_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Retrieves the effective More Info field configuration for a given document.
    Dynamically discovers all synced real SQL columns for the document's type.
    Resolves multi-user override hierarchy: Admin Default Fields -> User Selected Fields -> Available Fields.
    """
    raw_str = str(document_id).strip()
    doc = (
        db.query(Invoice)
        .filter(or_(Invoice.id == raw_str, Invoice.doc_key == raw_str, Invoice.invoice_number == raw_str))
        .filter(Invoice.is_deleted == False)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    doc_type = normalize_doc_type(doc.document_type)
    available_fields = discover_available_fields_for_doc(doc, db=db)
    admin_defaults, user_selected, combined, scope, has_user_override = resolve_effective_configuration(
        db, doc_type, current_user, available_fields
    )

    is_admin = False
    if current_user:
        u_role = (current_user.role or "").lower().strip()
        is_admin = u_role in ["admin", "administrator", "system_admin", "superadmin"] or check_permission(
            current_user, "role:manage", db
        )

    return MoreInfoConfigResponse(
        document_type=doc_type,
        scope=scope,
        has_user_override=has_user_override,
        can_manage_default=is_admin,
        admin_default_fields=admin_defaults,
        user_selected_fields=user_selected,
        selected_fields=combined,
        available_fields=available_fields,
    )


@router.put("/api/document-types/{document_type}/more-info/config", response_model=MoreInfoConfigResponse)
def save_doc_type_more_info_config(
    document_type: str,
    payload: MoreInfoConfigSaveRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    norm_type = normalize_doc_type(document_type)
    u_role = (current_user.role or "").lower().strip()
    is_admin = u_role in ["admin", "administrator", "system_admin", "superadmin"] or check_permission(
        current_user, "role:manage", db
    )

    if payload.save_as_default and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privilege required to modify organization default configuration.",
        )

    target_user_id = None if payload.save_as_default else current_user.id
    target_scope = "GLOBAL" if payload.save_as_default else "USER"

    # Remove existing rows for this target scope & document_type
    if payload.save_as_default:
        db.query(DocumentTypeFieldConfiguration).filter(
            DocumentTypeFieldConfiguration.document_type == norm_type,
            DocumentTypeFieldConfiguration.user_id.is_(None),
        ).delete()
    else:
        db.query(DocumentTypeFieldConfiguration).filter(
            DocumentTypeFieldConfiguration.document_type == norm_type,
            DocumentTypeFieldConfiguration.user_id == current_user.id,
        ).delete()

    new_keys = []
    for idx, item in enumerate(payload.fields):
        if not item.field_key:
            continue
        base_meta = STANDARD_FIELD_MAP.get(item.field_key, {})
        # Also check ALL_COLUMN_LABELS for dynamically discovered fields
        col_meta = ALL_COLUMN_LABELS.get(item.field_key, {})
        new_row = DocumentTypeFieldConfiguration(
            document_type=norm_type,
            field_key=item.field_key,
            field_label=item.label or base_meta.get("label") or col_meta.get("label") or item.field_key.replace("_", " ").title(),
            category=item.category or base_meta.get("category") or col_meta.get("category") or "OTHER",
            source=item.source or base_meta.get("source") or col_meta.get("source") or "ERP",
            display_order=item.display_order if item.display_order > 0 else (idx + 1),
            is_visible=item.is_visible,
            configuration_scope=target_scope,
            user_id=target_user_id,
            created_by=current_user.username,
            updated_by=current_user.username,
        )
        db.add(new_row)
        if item.is_visible:
            new_keys.append(item.field_key)

    try:
        audit_entry = AuditLog(
            invoice_id=None,
            user=current_user.username,
            action="MORE_INFO_CONFIG_UPDATE",
            stage="MoreInfoConfig",
            notes=f"Updated More Info configuration for doc type {norm_type} (scope: {target_scope})",
            ip_address="127.0.0.1",
        )
        db.add(audit_entry)

        sys_log = SystemEngineLog(
            module_name="MoreInfoConfig",
            log_level="INFO",
            message=f"Saved More Info config for doc type {norm_type} by user {current_user.username} (scope: {target_scope})",
            details=json.dumps({"document_type": norm_type, "scope": target_scope, "fields_count": len(payload.fields)}),
        )
        db.add(sys_log)
    except Exception as exc:
        logger.debug("Failed to record More Info audit log: %s", exc)

    db.commit()

    sample_doc = (
        db.query(Invoice)
        .filter(Invoice.document_type == norm_type, Invoice.is_deleted == False)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    available_fields = discover_available_fields_for_doc(sample_doc, db=db) if sample_doc else []

    admin_defaults, user_selected, combined, scope, has_user_override = resolve_effective_configuration(
        db, norm_type, current_user, available_fields
    )

    return MoreInfoConfigResponse(
        document_type=norm_type,
        scope=scope,
        has_user_override=has_user_override,
        can_manage_default=is_admin,
        admin_default_fields=admin_defaults,
        user_selected_fields=user_selected,
        selected_fields=combined,
        available_fields=available_fields,
    )


@router.put("/api/documents/{document_id}/more-info/config", response_model=MoreInfoConfigResponse)
@router.put("/api/invoices/{document_id}/more-info/config", response_model=MoreInfoConfigResponse)
def save_document_more_info_config(
    document_id: str,
    payload: MoreInfoConfigSaveRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Saves More Info field configuration for a document type via document_id.
    - Standard Users save personal configuration (user_id = current_user.id).
    - Admins can set save_as_default=True to update the organization default (user_id = NULL).
    """
    raw_str = str(document_id).strip()
    doc = (
        db.query(Invoice)
        .filter(or_(Invoice.id == raw_str, Invoice.doc_key == raw_str, Invoice.invoice_number == raw_str))
        .filter(Invoice.is_deleted == False)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    doc_type = normalize_doc_type(doc.document_type)
    available_fields = discover_available_fields_for_doc(doc, db=db)
    avail_map = {f.field_key: f for f in available_fields}

    u_role = (current_user.role or "").lower().strip()
    is_admin = u_role in ["admin", "administrator", "system_admin", "superadmin"] or check_permission(
        current_user, "role:manage", db
    )

    if payload.reset_to_default:
        db.query(DocumentTypeFieldConfiguration).filter(
            DocumentTypeFieldConfiguration.document_type == doc_type,
            DocumentTypeFieldConfiguration.user_id == current_user.id,
        ).delete()
        db.commit()

        admin_defaults, user_selected, combined, scope, has_user_override = resolve_effective_configuration(
            db, doc_type, current_user, available_fields
        )
        return MoreInfoConfigResponse(
            document_type=doc_type,
            scope=scope,
            has_user_override=has_user_override,
            can_manage_default=is_admin,
            admin_default_fields=admin_defaults,
            user_selected_fields=user_selected,
            selected_fields=combined,
            available_fields=available_fields,
        )

    if payload.save_as_default and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privilege required to modify organization default configuration.",
        )

    target_user_id = None if payload.save_as_default else current_user.id
    target_scope = "GLOBAL" if payload.save_as_default else "USER"

    if payload.save_as_default:
        db.query(DocumentTypeFieldConfiguration).filter(
            DocumentTypeFieldConfiguration.document_type == doc_type,
            DocumentTypeFieldConfiguration.user_id.is_(None),
        ).delete()
    else:
        db.query(DocumentTypeFieldConfiguration).filter(
            DocumentTypeFieldConfiguration.document_type == doc_type,
            DocumentTypeFieldConfiguration.user_id == current_user.id,
        ).delete()

    new_keys = []
    for idx, item in enumerate(payload.fields):
        if not item.field_key:
            continue
        base_meta = avail_map.get(item.field_key)
        std_meta = STANDARD_FIELD_MAP.get(item.field_key, {})
        col_meta = ALL_COLUMN_LABELS.get(item.field_key, {})

        def _pick(attr: str, fallback: str) -> str:
            if getattr(item, attr, None):
                return getattr(item, attr)
            if base_meta and getattr(base_meta, attr, None):
                return getattr(base_meta, attr)
            if std_meta.get(attr):
                return std_meta[attr]
            if col_meta.get(attr):
                return col_meta[attr]
            return fallback

        new_row = DocumentTypeFieldConfiguration(
            document_type=doc_type,
            field_key=item.field_key,
            field_label=_pick("label", item.field_key.replace("_", " ").title()),
            category=_pick("category", "OTHER"),
            source=_pick("source", "ERP"),
            display_order=item.display_order if item.display_order > 0 else (idx + 1),
            is_visible=item.is_visible,
            configuration_scope=target_scope,
            user_id=target_user_id,
            created_by=current_user.username,
            updated_by=current_user.username,
        )
        db.add(new_row)
        if item.is_visible:
            new_keys.append(item.field_key)

    try:
        audit_entry = AuditLog(
            invoice_id=doc.id,
            user=current_user.username,
            action="MORE_INFO_CONFIG_UPDATE",
            stage="MoreInfoConfig",
            notes=f"Updated More Info configuration for document {doc.id} (scope: {target_scope})",
            ip_address="127.0.0.1",
        )
        db.add(audit_entry)

        sys_log = SystemEngineLog(
            module_name="MoreInfoConfig",
            log_level="INFO",
            message=f"Saved More Info config for document {doc.id} by user {current_user.username} (scope: {target_scope})",
            details=json.dumps({"document_id": doc.id, "scope": target_scope, "fields_count": len(payload.fields)}),
        )
        db.add(sys_log)
    except Exception as exc:
        logger.debug("Failed to record More Info audit log: %s", exc)

    db.commit()

    admin_defaults, user_selected, combined, scope, has_user_override = resolve_effective_configuration(
        db, doc_type, current_user, available_fields
    )

    return MoreInfoConfigResponse(
        document_type=doc_type,
        scope=scope,
        has_user_override=has_user_override,
        can_manage_default=is_admin,
        admin_default_fields=admin_defaults,
        user_selected_fields=user_selected,
        selected_fields=combined,
        available_fields=available_fields,
    )


@router.get("/api/document-types/{document_type}/available-fields", response_model=List[MoreInfoFieldConfigItem])
def get_document_type_available_fields(
    document_type: str,
    db: Session = Depends(get_db),
):
    """
    Returns available fields catalogue for a given document type.
    Dynamically discovers fields from the most recent document of that type.
    """
    norm_type = normalize_doc_type(document_type)
    sample_doc = (
        db.query(Invoice)
        .filter(Invoice.document_type == norm_type, Invoice.is_deleted == False)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    if sample_doc:
        return discover_available_fields_for_doc(sample_doc, db=db)

    # No document found — return configured catalog for this type
    catalog = DOCUMENT_TYPE_ALLOWED_FIELDS.get(norm_type, DOCUMENT_TYPE_ALLOWED_FIELDS.get("AP INVOICE", []))
    return [
        MoreInfoFieldConfigItem(
            field_key=item["field_key"],
            label=item["label"],
            category=item["category"],
            source=item["source"],
            display_order=0,
            is_visible=True,
            sample_value=None,
        )
        for item in catalog
    ]
