import json
import logging
from typing import Any, Dict, List, Optional, Tuple

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
# Canonical Field Registry & Discovery
# ---------------------------------------------------------------------------

STANDARD_FIELD_CATALOG: List[Dict[str, Any]] = [
    # Vendor Information
    {"field_key": "vendor_name", "label": "Vendor Name", "category": "VENDOR INFORMATION", "source": "ERP"},
    {"field_key": "vendor_code", "label": "Vendor Code", "category": "VENDOR INFORMATION", "source": "ERP"},
    {"field_key": "vendor_gstin", "label": "Vendor GSTIN", "category": "VENDOR INFORMATION", "source": "ERP"},
    {"field_key": "party_name", "label": "Party / Supplier Name", "category": "VENDOR INFORMATION", "source": "Document"},
    {"field_key": "vendor_address", "label": "Vendor Address", "category": "VENDOR INFORMATION", "source": "ERP"},
    {"field_key": "contact_person", "label": "Contact Person", "category": "VENDOR INFORMATION", "source": "Document"},

    # Invoice Information
    {"field_key": "invoice_number", "label": "Invoice Number", "category": "INVOICE INFORMATION", "source": "Document"},
    {"field_key": "invoice_date", "label": "Invoice Date", "category": "INVOICE INFORMATION", "source": "Document"},
    {"field_key": "doc_due_date", "label": "Due Date", "category": "INVOICE INFORMATION", "source": "ERP"},
    {"field_key": "doc_num", "label": "ERP Doc Number", "category": "INVOICE INFORMATION", "source": "ERP"},
    {"field_key": "doc_key", "label": "ERP Doc Key", "category": "INVOICE INFORMATION", "source": "ERP"},
    {"field_key": "document_type", "label": "Document Type", "category": "INVOICE INFORMATION", "source": "Document"},
    {"field_key": "invoice_type", "label": "Invoice Type", "category": "INVOICE INFORMATION", "source": "Document"},

    # Purchase Order
    {"field_key": "po_number", "label": "PO Number", "category": "PURCHASE ORDER", "source": "ERP"},
    {"field_key": "po_date", "label": "PO Date", "category": "PURCHASE ORDER", "source": "ERP"},
    {"field_key": "po_amount", "label": "PO Amount", "category": "PURCHASE ORDER", "source": "ERP"},
    {"field_key": "indent_number", "label": "Indent Number", "category": "PURCHASE ORDER", "source": "ERP"},

    # Financial Information
    {"field_key": "taxable_amount", "label": "Taxable Amount", "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    {"field_key": "gst_amount", "label": "GST Amount", "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    {"field_key": "total_amount", "label": "Total Amount", "category": "FINANCIAL INFORMATION", "source": "Document"},
    {"field_key": "cgst", "label": "CGST", "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    {"field_key": "sgst", "label": "SGST", "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    {"field_key": "igst", "label": "IGST", "category": "FINANCIAL INFORMATION", "source": "Calculated"},
    {"field_key": "discount", "label": "Discount", "category": "FINANCIAL INFORMATION", "source": "ERP"},
    {"field_key": "tds", "label": "TDS", "category": "FINANCIAL INFORMATION", "source": "ERP"},
    {"field_key": "currency", "label": "Currency", "category": "FINANCIAL INFORMATION", "source": "Document"},

    # Organization
    {"field_key": "cost_center", "label": "Cost Center", "category": "ORGANIZATION", "source": "ERP"},
    {"field_key": "plant", "label": "Plant Location", "category": "ORGANIZATION", "source": "ERP"},
    {"field_key": "division", "label": "Division / Branch", "category": "ORGANIZATION", "source": "ERP"},
    {"field_key": "department", "label": "Department", "category": "ORGANIZATION", "source": "ERP"},
    {"field_key": "category", "label": "Expense Category", "category": "ORGANIZATION", "source": "Document"},

    # Payment
    {"field_key": "payment_terms", "label": "Payment Terms", "category": "PAYMENT", "source": "ERP"},
    {"field_key": "pay_mode", "label": "Payment Mode", "category": "PAYMENT", "source": "ERP"},
]

STANDARD_FIELD_MAP = {f["field_key"]: f for f in STANDARD_FIELD_CATALOG}

# Document-type built-in default field keys (in display order)
# Strictly excludes fields already displayed in the fixed top summary row (vendor_name, invoice_number, invoice_date, po_number, total_amount)
DEFAULT_DOCUMENT_TYPE_FIELDS: Dict[str, List[str]] = {
    "AP INVOICE": [
        "vendor_gstin",
        "vendor_code",
        "taxable_amount",
        "gst_amount",
        "payment_terms",
        "cost_center",
        "division",
        "plant",
    ],
    "INVOICE": [
        "vendor_gstin",
        "vendor_code",
        "taxable_amount",
        "gst_amount",
        "payment_terms",
        "cost_center",
        "division",
        "plant",
    ],
    "CREDIT NOTE": [
        "vendor_gstin",
        "vendor_code",
        "taxable_amount",
        "gst_amount",
        "cost_center",
        "payment_terms",
    ],
    "AR CREDIT NOTE": [
        "vendor_gstin",
        "vendor_code",
        "taxable_amount",
        "gst_amount",
        "cost_center",
        "payment_terms",
    ],
    "DEBIT NOTE": [
        "vendor_gstin",
        "vendor_code",
        "taxable_amount",
        "gst_amount",
        "cost_center",
        "payment_terms",
    ],
    "AP DEBIT NOTE": [
        "vendor_gstin",
        "vendor_code",
        "taxable_amount",
        "gst_amount",
        "cost_center",
        "payment_terms",
    ],
    "PURCHASE ORDER": [
        "po_date",
        "payment_terms",
        "vendor_gstin",
        "vendor_code",
        "cost_center",
        "plant",
    ],
    "PO": [
        "po_date",
        "payment_terms",
        "vendor_gstin",
        "vendor_code",
        "cost_center",
        "plant",
    ],
}

DEFAULT_FALLBACK_FIELDS = [
    "vendor_gstin",
    "vendor_code",
    "taxable_amount",
    "gst_amount",
    "payment_terms",
]


def normalize_doc_type(doc_type: Optional[str]) -> str:
    if not doc_type:
        return "AP INVOICE"
    cleaned = doc_type.strip().upper()
    if cleaned in ("INVOICE", "AP INVOICE", "TAX INVOICE", "STANDARD INVOICE"):
        return "AP INVOICE"
    if "CREDIT" in cleaned:
        return "CREDIT NOTE"
    if "DEBIT" in cleaned:
        return "DEBIT NOTE"
    if "PURCHASE" in cleaned or "PO" in cleaned:
        return "PURCHASE ORDER"
    return cleaned


def extract_custom_data_dict(doc: Invoice) -> Dict[str, Any]:
    if not doc or not doc.custom_data:
        return {}
    if isinstance(doc.custom_data, dict):
        return doc.custom_data
    if isinstance(doc.custom_data, str):
        try:
            return json.loads(doc.custom_data)
        except Exception:
            return {}
    return {}


def format_field_value(raw: Any, field_key: str) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        if any(w in field_key for w in ("amount", "total", "gst", "tax", "price", "base")):
            return f"₹{raw:,.2f}"
        return str(raw)
    s = str(raw).strip()
    return s if s else None


def get_field_value_from_document(doc: Invoice, field_key: str, custom_dict: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (formatted_value, raw_value_str). If missing, returns (None, None).
    """
    gross_amt = float(doc.amount or 0.0)
    base_taxable_amt = float(doc.base_amount or (round(gross_amt / 1.18, 2) if gross_amt > 0 else 0.0))
    gst_tax_amt = float(doc.tax_amount or (round(gross_amt - base_taxable_amt, 2) if gross_amt > 0 else 0.0))

    val_map: Dict[str, Any] = {
        "vendor_name": doc.vendor_name or doc.party_name or custom_dict.get("vendor_name") or custom_dict.get("CardName"),
        "vendor_code": doc.vendor_code or doc.party_code or custom_dict.get("vendor_code") or custom_dict.get("CardCode"),
        "vendor_gstin": doc.vendor_gstin or doc.party_tax_id or doc.gstin or custom_dict.get("vendor_gstin") or custom_dict.get("gstin") or custom_dict.get("GSTIN"),
        "party_name": doc.party_name or doc.vendor_name,
        "vendor_address": custom_dict.get("vendor_address") or custom_dict.get("address"),
        "contact_person": doc.contact_person or custom_dict.get("contact_person"),
        "invoice_number": doc.invoice_number or custom_dict.get("invoice_number") or custom_dict.get("DocRefNo"),
        "invoice_date": doc.invoice_date or custom_dict.get("invoice_date") or custom_dict.get("DocDate"),
        "doc_due_date": doc.doc_due_date or custom_dict.get("due_date") or custom_dict.get("doc_due_date"),
        "doc_num": doc.doc_num or custom_dict.get("doc_num") or custom_dict.get("DocNum"),
        "doc_key": doc.doc_key or custom_dict.get("doc_key") or custom_dict.get("DocKey"),
        "document_type": doc.document_type or "AP INVOICE",
        "invoice_type": custom_dict.get("invoice_type") or doc.category or doc.document_type,
        "po_number": doc.po_number or custom_dict.get("po_number") or custom_dict.get("PONumber"),
        "po_date": custom_dict.get("po_date") or custom_dict.get("orderDate") or custom_dict.get("poDate"),
        "po_amount": custom_dict.get("po_amount"),
        "indent_number": custom_dict.get("indentNumber") or custom_dict.get("indent_number"),
        "taxable_amount": base_taxable_amt if base_taxable_amt > 0 else (custom_dict.get("taxable_amount") or custom_dict.get("base_amount")),
        "gst_amount": gst_tax_amt if gst_tax_amt > 0 else (custom_dict.get("gst_amount") or custom_dict.get("tax_amount")),
        "total_amount": gross_amt if gross_amt > 0 else (custom_dict.get("total_amount") or custom_dict.get("DocTotal")),
        "cgst": float(doc.cgst or 0.0) if doc.cgst else custom_dict.get("cgst"),
        "sgst": float(doc.sgst or 0.0) if doc.sgst else custom_dict.get("sgst"),
        "igst": float(doc.igst or 0.0) if doc.igst else custom_dict.get("igst"),
        "discount": custom_dict.get("discount"),
        "tds": custom_dict.get("tds"),
        "currency": doc.currency or custom_dict.get("currency") or "INR",
        "cost_center": doc.cost_center or custom_dict.get("cost_center") or custom_dict.get("CostCenter"),
        "plant": doc.plant or custom_dict.get("plant") or custom_dict.get("Branch"),
        "division": doc.division or custom_dict.get("division") or custom_dict.get("CompanyCode"),
        "department": custom_dict.get("department") or custom_dict.get("dept"),
        "category": doc.category or custom_dict.get("category"),
        "payment_terms": doc.payment_terms or custom_dict.get("payment_terms") or custom_dict.get("paymentTerms") or custom_dict.get("PaymentTerms"),
        "pay_mode": doc.pay_mode or custom_dict.get("pay_mode"),
    }

    # If direct key match in map:
    if field_key in val_map and val_map[field_key] is not None:
        raw = val_map[field_key]
        formatted = format_field_value(raw, field_key)
        return formatted, str(raw)

    # Check custom_dict directly:
    if field_key in custom_dict and custom_dict[field_key] is not None:
        raw = custom_dict[field_key]
        formatted = format_field_value(raw, field_key)
        return formatted, str(raw)

    # Check case-insensitive match in custom_dict:
    fk_lower = field_key.lower().replace(" ", "_")
    for k, v in custom_dict.items():
        if k.lower().replace(" ", "_") == fk_lower and v is not None:
            formatted = format_field_value(v, field_key)
            return formatted, str(v)

    return None, None


def discover_available_fields_for_doc(doc: Invoice) -> List[MoreInfoFieldConfigItem]:
    """
    Builds the complete set of available fields for this document based on the
    standard field catalog + any dynamic attributes present in custom_data.
    """
    custom_dict = extract_custom_data_dict(doc)
    fields_result: List[MoreInfoFieldConfigItem] = []
    seen_keys = set()

    for item in STANDARD_FIELD_CATALOG:
        key = item["field_key"]
        seen_keys.add(key.lower())
        formatted_val, raw_val = get_field_value_from_document(doc, key, custom_dict)
        
        fields_result.append(
            MoreInfoFieldConfigItem(
                field_key=key,
                label=item["label"],
                category=item["category"],
                source=item["source"],
                sample_value=formatted_val,
                display_order=0,
                is_visible=True,
            )
        )

    # Dynamically discover any custom fields in custom_dict:
    for k, v in custom_dict.items():
        clean_k = k.strip()
        if clean_k.lower() in seen_keys or v is None or v == "":
            continue
        seen_keys.add(clean_k.lower())

        # Determine category based on key name
        kl = clean_k.lower()
        if any(w in kl for w in ("vendor", "supplier", "party")):
            cat = "VENDOR INFORMATION"
        elif any(w in kl for w in ("invoice", "bill", "due", "date", "no", "ref")):
            cat = "INVOICE INFORMATION"
        elif any(w in kl for w in ("po", "order", "indent", "pr")):
            cat = "PURCHASE ORDER"
        elif any(w in kl for w in ("amt", "tax", "gst", "discount", "tds", "rate", "fee", "cost", "total", "price")):
            cat = "FINANCIAL INFORMATION"
        elif any(w in kl for w in ("plant", "dept", "div", "branch", "center", "loc", "org")):
            cat = "ORGANIZATION"
        elif any(w in kl for w in ("pay", "bank", "term", "mode")):
            cat = "PAYMENT"
        else:
            cat = "ADDITIONAL METADATA"

        label = clean_k.replace("_", " ").title()
        formatted_val = format_field_value(v, clean_k)

        fields_result.append(
            MoreInfoFieldConfigItem(
                field_key=clean_k,
                label=label,
                category=cat,
                source="ERP",
                sample_value=formatted_val,
                display_order=0,
                is_visible=True,
            )
        )

    return fields_result


def resolve_effective_configuration(
    db: Session,
    doc_type: str,
    user: Optional[User],
    available_fields: List[MoreInfoFieldConfigItem],
) -> Tuple[List[MoreInfoFieldConfigItem], str, bool]:
    """
    Returns (selected_fields_in_order, scope, has_user_override).
    Level 1: User personal override (user_id = user.id)
    Level 2: Document type global default (user_id IS NULL)
    Level 3: Built-in schema default for doc_type
    """
    norm_type = normalize_doc_type(doc_type)
    avail_map = {f.field_key: f for f in available_fields}

    # 1. Check user personal configuration:
    if user and user.id:
        user_configs = (
            db.query(DocumentTypeFieldConfiguration)
            .filter(
                DocumentTypeFieldConfiguration.document_type == norm_type,
                DocumentTypeFieldConfiguration.user_id == user.id,
            )
            .order_by(DocumentTypeFieldConfiguration.display_order.asc())
            .all()
        )
        if user_configs:
            selected: List[MoreInfoFieldConfigItem] = []
            for cfg in user_configs:
                if cfg.is_visible:
                    base = avail_map.get(cfg.field_key)
                    selected.append(
                        MoreInfoFieldConfigItem(
                            field_key=cfg.field_key,
                            label=cfg.field_label or (base.label if base else cfg.field_key.replace("_", " ").title()),
                            category=cfg.category or (base.category if base else "OTHER"),
                            source=cfg.source or (base.source if base else "ERP"),
                            display_order=cfg.display_order,
                            is_visible=True,
                            sample_value=base.sample_value if base else None,
                        )
                    )
            return selected, "USER", True

    # 2. Check document type default configuration (user_id IS NULL):
    global_configs = (
        db.query(DocumentTypeFieldConfiguration)
        .filter(
            DocumentTypeFieldConfiguration.document_type == norm_type,
            DocumentTypeFieldConfiguration.user_id.is_(None),
        )
        .order_by(DocumentTypeFieldConfiguration.display_order.asc())
        .all()
    )
    if global_configs:
        selected: List[MoreInfoFieldConfigItem] = []
        for cfg in global_configs:
            if cfg.is_visible:
                base = avail_map.get(cfg.field_key)
                selected.append(
                    MoreInfoFieldConfigItem(
                        field_key=cfg.field_key,
                        label=cfg.field_label or (base.label if base else cfg.field_key.replace("_", " ").title()),
                        category=cfg.category or (base.category if base else "OTHER"),
                        source=cfg.source or (base.source if base else "ERP"),
                        display_order=cfg.display_order,
                        is_visible=True,
                        sample_value=base.sample_value if base else None,
                    )
                )
        return selected, "GLOBAL", False

    # 3. Built-in schema fallback:
    default_keys = DEFAULT_DOCUMENT_TYPE_FIELDS.get(norm_type, DEFAULT_FALLBACK_FIELDS)
    selected: List[MoreInfoFieldConfigItem] = []
    for idx, key in enumerate(default_keys):
        base = avail_map.get(key)
        if base:
            item_copy = base.model_copy()
            item_copy.display_order = idx + 1
            item_copy.is_visible = True
            selected.append(item_copy)
        elif key in STANDARD_FIELD_MAP:
            s = STANDARD_FIELD_MAP[key]
            selected.append(
                MoreInfoFieldConfigItem(
                    field_key=key,
                    label=s["label"],
                    category=s["category"],
                    source=s["source"],
                    display_order=idx + 1,
                    is_visible=True,
                    sample_value=None,
                )
            )

    return selected, "GLOBAL", False


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get("/api/documents/{document_id}/more-info/config", response_model=MoreInfoConfigResponse)
@router.get("/api/invoices/{document_id}/more-info/config", response_model=MoreInfoConfigResponse)
def get_document_more_info_config(
    document_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """
    Retrieves the effective More Info field configuration for a given document.
    Resolves multi-user override hierarchy: User View -> Document Type Default -> System Default.
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
    available_fields = discover_available_fields_for_doc(doc)
    selected_fields, scope, has_user_override = resolve_effective_configuration(
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
        selected_fields=selected_fields,
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
    Saves More Info field configuration for a document type.
    - Standard Users save personal configuration (user_id = current_user.id).
    - Admins can set save_as_default=True to update the organization default (user_id = NULL).
    - Users can set reset_to_default=True to remove their personal override and revert to default.
    - Validates fields against available fields.
    - Records an audit log entry.
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
    available_fields = discover_available_fields_for_doc(doc)
    avail_map = {f.field_key: f for f in available_fields}

    u_role = (current_user.role or "").lower().strip()
    is_admin = u_role in ["admin", "administrator", "system_admin", "superadmin"] or check_permission(
        current_user, "role:manage", db
    )

    # Handle Reset to Default:
    if payload.reset_to_default:
        db.query(DocumentTypeFieldConfiguration).filter(
            DocumentTypeFieldConfiguration.document_type == doc_type,
            DocumentTypeFieldConfiguration.user_id == current_user.id,
        ).delete()
        db.commit()

        # Audit Log
        db.add(
            AuditLog(
                invoice_id=doc.id,
                user=current_user.username,
                action="MORE_INFO_CONFIG_RESET",
                stage="Field Configuration",
                notes=f"User '{current_user.username}' reset More Info configuration for '{doc_type}' to organization default.",
            )
        )
        db.add(
            SystemEngineLog(
                module_name="MoreInfoConfig",
                invoice_id=doc.id,
                user=current_user.username,
                action="RESET_TO_DEFAULT",
                details=f"Document Type: {doc_type}, User ID: {current_user.id}",
            )
        )
        db.commit()

        selected_fields, scope, has_user_override = resolve_effective_configuration(
            db, doc_type, current_user, available_fields
        )
        return MoreInfoConfigResponse(
            document_type=doc_type,
            scope=scope,
            has_user_override=has_user_override,
            can_manage_default=is_admin,
            selected_fields=selected_fields,
            available_fields=available_fields,
        )

    # Permission check for saving as organization default:
    if payload.save_as_default and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privilege required to modify organization default configuration.",
        )

    # Validate that submitted keys are valid:
    valid_keys = set(avail_map.keys()) | set(STANDARD_FIELD_MAP.keys())
    saved_items = []
    for item in payload.fields:
        if not item.field_key or item.field_key not in valid_keys:
            continue
        saved_items.append(item)

    if not saved_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one valid field must be selected.",
        )

    target_user_id = None if payload.save_as_default else current_user.id
    target_scope = "GLOBAL" if payload.save_as_default else "USER"

    # Fetch previous config for audit trail
    prev_query = db.query(DocumentTypeFieldConfiguration).filter(
        DocumentTypeFieldConfiguration.document_type == doc_type,
    )
    if payload.save_as_default:
        prev_query = prev_query.filter(DocumentTypeFieldConfiguration.user_id.is_(None))
    else:
        prev_query = prev_query.filter(DocumentTypeFieldConfiguration.user_id == current_user.id)
    prev_rows = prev_query.all()
    old_keys = [r.field_key for r in prev_rows]

    # Remove existing rows for this target scope:
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

    # Insert new configurations:
    new_keys = []
    for idx, item in enumerate(saved_items):
        base_meta = avail_map.get(item.field_key) or STANDARD_FIELD_MAP.get(item.field_key, {})
        new_row = DocumentTypeFieldConfiguration(
            document_type=doc_type,
            field_key=item.field_key,
            field_label=item.label or (base_meta.label if hasattr(base_meta, "label") else base_meta.get("label")),
            category=item.category or (base_meta.category if hasattr(base_meta, "category") else base_meta.get("category")),
            source=item.source or (base_meta.source if hasattr(base_meta, "source") else base_meta.get("source", "ERP")),
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

    db.commit()

    # Audit Log Entry:
    audit_notes = (
        f"Updated {target_scope.lower()} More Info configuration for '{doc_type}'. "
        f"Fields count: {len(new_keys)}. Keys: {', '.join(new_keys)}"
    )
    db.add(
        AuditLog(
            invoice_id=doc.id,
            user=current_user.username,
            action="MORE_INFO_CONFIG_UPDATED",
            stage="Field Configuration",
            notes=audit_notes,
        )
    )
    db.add(
        SystemEngineLog(
            module_name="MoreInfoConfig",
            invoice_id=doc.id,
            user=current_user.username,
            action="UPDATE_FIELD_CONFIG",
            details=json.dumps({
                "document_type": doc_type,
                "scope": target_scope,
                "user_id": target_user_id,
                "old_config": old_keys,
                "new_config": new_keys,
            }),
        )
    )
    db.commit()

    selected_fields, scope, has_user_override = resolve_effective_configuration(
        db, doc_type, current_user, available_fields
    )

    return MoreInfoConfigResponse(
        document_type=doc_type,
        scope=scope,
        has_user_override=has_user_override,
        can_manage_default=is_admin,
        selected_fields=selected_fields,
        available_fields=available_fields,
    )


@router.get("/api/document-types/{document_type}/available-fields", response_model=List[MoreInfoFieldConfigItem])
def get_document_type_available_fields(
    document_type: str,
    db: Session = Depends(get_db),
):
    """
    Returns available fields catalogue for a given document type.
    """
    norm_type = normalize_doc_type(document_type)
    sample_doc = (
        db.query(Invoice)
        .filter(Invoice.document_type == norm_type, Invoice.is_deleted == False)
        .order_by(Invoice.created_at.desc())
        .first()
    )
    if sample_doc:
        return discover_available_fields_for_doc(sample_doc)

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
        for item in STANDARD_FIELD_CATALOG
    ]
