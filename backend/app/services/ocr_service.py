import json
import logging
import os
import re
import threading
import warnings
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Any, Optional, List

from app.config.settings import settings

logger = logging.getLogger(__name__)

MAX_CONCURRENT_OCR = int(getattr(settings, "MAX_CONCURRENT_OCR", 3))
OCR_SEMAPHORE_TIMEOUT = float(getattr(settings, "OCR_SEMAPHORE_TIMEOUT", 60.0))
_ocr_semaphore = threading.BoundedSemaphore(MAX_CONCURRENT_OCR)


class OCRConcurrencyError(RuntimeError):
    """Raised when the maximum concurrent OCR/LLM extraction limit is saturated."""


@contextmanager
def ocr_concurrency_guard(timeout: Optional[float] = None):
    """
    Context manager to limit simultaneous OCR and LLM extractions.
    Prevents CPU and memory starvation under high concurrent uploads.
    """
    t = timeout if timeout is not None else OCR_SEMAPHORE_TIMEOUT
    acquired = _ocr_semaphore.acquire(timeout=t)
    if not acquired:
        logger.warning(
            "[OCR] Maximum concurrent OCR limit (%d) reached. Job timed out after %s seconds.",
            MAX_CONCURRENT_OCR, t
        )
        raise OCRConcurrencyError(
            f"Server busy: OCR/LLM extraction capacity reached ({MAX_CONCURRENT_OCR} concurrent). Please retry."
        )
    try:
        yield
    finally:
        _ocr_semaphore.release()


def get_ocr_semaphore() -> threading.BoundedSemaphore:
    """Helper for testing and diagnostics."""
    return _ocr_semaphore


def set_ocr_semaphore(semaphore: threading.BoundedSemaphore):
    """Helper for testing concurrency behavior."""
    global _ocr_semaphore
    _ocr_semaphore = semaphore


_ocr_engine = None
_ocr_lock = threading.Lock()


def get_ocr_engine():
    """Lazily load PaddleOCR as a singleton to avoid repeated high startup overhead."""
    global _ocr_engine
    if _ocr_engine is None:
        with _ocr_lock:
            if _ocr_engine is None:
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")
                        from paddleocr import PaddleOCR
                        # Fast English OCR without angle classifier overhead
                        _ocr_engine = PaddleOCR(use_angle_cls=False, lang='en', show_log=False)
                    logger.info("[OCR] PaddleOCR engine initialized successfully.")
                except Exception as e:
                    logger.warning("[OCR] PaddleOCR initialization failed: %s", e)
                    _ocr_engine = False
    return _ocr_engine if _ocr_engine is not False else None


def extract_raw_text(file_path: Path, force_paddle: bool = False) -> str:
    """
    Extract raw text from PDF or Image files using PyMuPDF (fitz) with PaddleOCR.
    Supports .pdf, .jpg, .jpeg, .png, .tiff, .bmp, .webp.
    For images, uses PaddleOCR directly.
    For PDFs, extracts digital text stream; if scanned/sparse or forced, runs PaddleOCR.
    """
    text_content = ""
    if not file_path.exists():
        return text_content

    suffix = file_path.suffix.lower()
    image_suffixes = {".jpg", ".jpeg", ".png", ".tiff", ".bmp", ".webp"}

    # 1. Image files: Direct PaddleOCR extraction
    if suffix in image_suffixes:
        ocr = get_ocr_engine()
        if ocr:
            try:
                result = ocr.ocr(str(file_path), cls=False)
                if result and result[0]:
                    for line in result[0]:
                        if line and len(line) >= 2 and line[1]:
                            text_content += str(line[1][0]) + "\n"
            except Exception as ocr_err:
                logger.warning("[OCR] Direct image PaddleOCR extraction failed: %s", ocr_err)
        return text_content

    # 2. PDF files: PyMuPDF extraction + PaddleOCR fallback for scanned/sparse pages
    try:
        import fitz
    except ImportError:
        fitz = None

    if suffix == ".pdf" and fitz:
        try:
            doc = fitz.open(str(file_path))
            for page in doc:
                text_content += page.get_text() + "\n"
            doc.close()
        except Exception as e:
            logger.warning("[OCR] fitz text extraction failed: %s", e)

    # 3. If extracted text is empty/sparse (scanned PDF) or forced, run PaddleOCR on pages
    if force_paddle or len(text_content.strip()) < 50:
        ocr = get_ocr_engine()
        if ocr and fitz and suffix == ".pdf":
            try:
                doc = fitz.open(str(file_path))
                max_pages = min(len(doc), 3)
                scanned_text = ""
                for page_idx in range(max_pages):
                    page = doc[page_idx]
                    pix = page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("png")
                    result = ocr.ocr(img_bytes, cls=False)
                    if result and result[0]:
                        for line in result[0]:
                            if line and len(line) >= 2 and line[1]:
                                scanned_text += str(line[1][0]) + "\n"
                doc.close()
                if scanned_text.strip():
                    text_content = scanned_text
            except Exception as ocr_err:
                logger.warning("[OCR] Scanned PDF PaddleOCR fallback error: %s", ocr_err)

    return text_content


MONTH_MAP = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
}


def parse_date_to_iso(raw_date: str) -> str:
    """Format extracted date string into ISO YYYY-MM-DD format."""
    clean_date = raw_date.strip().replace('.', '-').replace('/', '-')
    parts = clean_date.split('-')
    if len(parts) == 3:
        m_key = parts[1].lower()[:3]
        if m_key in MONTH_MAP:
            day = int(parts[0]) if parts[0].isdigit() else 1
            year = parts[2] if len(parts[2]) == 4 else f"20{parts[2]}"
            return f"{year}-{MONTH_MAP[m_key]}-{day:02d}"
        if len(parts[0]) == 4 and parts[0].isdigit():  # YYYY-MM-DD
            return f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
        elif len(parts[2]) == 4 and parts[2].isdigit():  # DD-MM-YYYY
            return f"{parts[2]}-{int(parts[1]):02d}-{int(parts[0]):02d}"
    return clean_date


def parse_invoice_heuristics(text_content: str) -> Dict[str, Any]:
    """Deterministic heuristic extraction from document text."""
    extracted: Dict[str, Any] = {
        "vendor_name": "",
        "invoice_number": "",
        "invoice_date": "",
        "amount": 0.0,
        "base_amount": 0.0,
        "tax_amount": 0.0,
        "cgst": 0.0,
        "sgst": 0.0,
        "igst": 0.0,
        "gstin": "",
        "po_number": "",
        "document_type": "AP INVOICE",
        "division": "VCC",
        "confidence_score": 0.75,
        "extraction_source": "ocr_rules"
    }

    if not text_content:
        return extracted

    # GSTIN extraction (standard 15-char Indian GSTIN format)
    gst_match = re.search(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', text_content)
    if gst_match:
        extracted["gstin"] = gst_match.group(0)

    # Invoice number extraction
    inv_match = re.search(
        r'(?:Invoice|Tax Invoice|Bill|Inv)\s*(?:No\.?|#|Number|Num)?[ \t]*[:\-\#][ \t]*([A-Za-z0-9\-\/]{2,35})',
        text_content,
        re.IGNORECASE
    )
    if not inv_match:
        inv_match = re.search(
            r'(?:Invoice|Bill|Inv)\s+(?:No\.?|#|Number)[ \t]+([A-Za-z0-9\-\/]{2,35})',
            text_content,
            re.IGNORECASE
        )
    if inv_match:
        extracted["invoice_number"] = inv_match.group(1).strip().rstrip('.,;')

    # PO Number extraction (fixed boundary check to avoid matching parts of words like 'components')
    po_match = re.search(
        r'\b(?:PO|P\.O\.|Purchase Order)\b\s*(?:No\.?|#|Number)?[ \t]*[:\-\#]?[ \t]*([A-Za-z0-9\-\/]{2,35})',
        text_content,
        re.IGNORECASE
    )
    if po_match:
        extracted["po_number"] = po_match.group(1).strip().rstrip('.,;')

    # Date extraction (supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD-MMM-YYYY)
    date_match = re.search(
        r'(?:Date|Invoice Date|Dated)[ \t]*[:\-]?[ \t]*([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4}|[0-9]{4}[/\-\.][0-9]{1,2}[/\-\.][0-9]{1,2}|[0-9]{1,2}[/\-\.][A-Za-z]{3,9}[/\-\.][0-9]{2,4})',
        text_content,
        re.IGNORECASE
    )
    if date_match:
        extracted["invoice_date"] = parse_date_to_iso(date_match.group(1))

    # Taxes extraction
    for tax_name in ["cgst", "sgst", "igst"]:
        tax_m = re.search(
            rf'(?:{tax_name})[ \t]*[:\-]?[ \t]*(?:INR|Rs\.?|₹)?[ \t]*([0-9,]+(?:\.[0-9]{{2}})?)',
            text_content,
            re.IGNORECASE
        )
        if tax_m:
            try:
                extracted[tax_name] = round(float(tax_m.group(1).replace(',', '')), 2)
            except Exception as exc:
                logger.debug("Failed parsing regex %s match: %s", tax_name, exc)

    # Explicit Tax Amount
    tax_tot_match = re.search(
        r'(?:Total\s*Tax|Tax\s*Amount|GST\s*Amount)[ \t]*[:\-]?[ \t]*(?:INR|Rs\.?|₹)?[ \t]*([0-9,]+(?:\.[0-9]{2})?)',
        text_content,
        re.IGNORECASE
    )
    if tax_tot_match:
        try:
            extracted["tax_amount"] = round(float(tax_tot_match.group(1).replace(',', '')), 2)
        except Exception as exc:
            logger.debug("Failed parsing total tax match: %s", exc)

    if extracted["tax_amount"] == 0.0 and (extracted["cgst"] > 0 or extracted["sgst"] > 0 or extracted["igst"] > 0):
        extracted["tax_amount"] = round(extracted["cgst"] + extracted["sgst"] + extracted["igst"], 2)

    # Base amount / Taxable value
    base_match = re.search(
        r'(?:Base\s*Amount|Sub\s*total|Subtotal|Taxable\s*Value|Taxable\s*Amount|Amount\s*before\s*tax)[ \t]*[:\-]?[ \t]*(?:INR|Rs\.?|₹)?[ \t]*([0-9,]+(?:\.[0-9]{2})?)',
        text_content,
        re.IGNORECASE
    )
    if base_match:
        try:
            extracted["base_amount"] = round(float(base_match.group(1).replace(',', '')), 2)
        except Exception as exc:
            logger.debug("Failed parsing base amount match: %s", exc)

    # Total Amount extraction
    amt_match = re.search(
        r'(?:Total\s*Amount|Grand\s*Total|Net\s*Amount|Amount\s*Payable|Invoice\s*Total|Total\s*Value|Total)[ \t]*[:\-]?[ \t]*(?:INR|Rs\.?|₹)?[ \t]*([0-9,]+(?:\.[0-9]{2})?)',
        text_content,
        re.IGNORECASE
    )
    if amt_match:
        try:
            cleaned = amt_match.group(1).replace(',', '')
            amt_val = float(cleaned)
            extracted["amount"] = round(amt_val, 2)
        except Exception as exc:
            logger.debug("Failed parsing regex amount match: %s", exc)

    # Cross-calculate missing amounts mathematically
    if extracted["amount"] > 0:
        if extracted["base_amount"] == 0.0:
            if extracted["tax_amount"] > 0:
                extracted["base_amount"] = round(extracted["amount"] - extracted["tax_amount"], 2)
            else:
                extracted["base_amount"] = round(extracted["amount"] / 1.18, 2)
                extracted["tax_amount"] = round(extracted["amount"] - extracted["base_amount"], 2)
        elif extracted["tax_amount"] == 0.0:
            extracted["tax_amount"] = round(extracted["amount"] - extracted["base_amount"], 2)
    elif extracted["base_amount"] > 0:
        if extracted["tax_amount"] > 0:
            extracted["amount"] = round(extracted["base_amount"] + extracted["tax_amount"], 2)

    # Vendor extraction: explicit label match ("Vendor: PRECISE TECH" or "Supplier: ...")
    vendor_label_match = re.search(
        r'(?:Vendor|Supplier|Seller|Issued By)(?:\s*Name)?[ \t]*[:\-][ \t]*([^\n\r]+)',
        text_content,
        re.IGNORECASE
    )
    if vendor_label_match:
        cand = vendor_label_match.group(1).strip()
        cand_clean = re.sub(r'^(?:M/s\.?|To:?|From:?)\s*', '', cand, flags=re.IGNORECASE).strip()
        ignore_words = {"name", "code", "details", "info", "address", "gstin", "number", "id", "no"}
        if len(cand_clean) > 2 and cand_clean.lower() not in ignore_words and not any(k in cand_clean.upper() for k in ["TAX INVOICE", "ORIGINAL", "DUPLICATE", "BUYER", "CONSIGNEE", "CUSTOMER", "BILL TO", "SHIP TO"]):
            extracted["vendor_name"] = cand_clean

    # Fallback vendor extraction heuristics: scan lines before buyer section for company indicators
    if not extracted["vendor_name"]:
        lines = [l.strip() for l in text_content.split('\n') if l.strip()]
        in_buyer_section = False
        company_keywords = [
            "PVT", "LTD", "LIMITED", "ENTERPRISES", "CORP", "INDUSTRIES", "TRADERS", 
            "SUPPLIERS", "M/S", "SERVICES", "SOLUTIONS", "WORKS", "MILLS", "PRIVATE", 
            "COMPANY", "TECHNOSOFT", "TECHNOLOGY", "SYSTEMS"
        ]
        skip_terms = ["TAX INVOICE", "ORIGINAL", "DUPLICATE", "CERTIFIED COMPANY", "APPLICATION SOFTWARE"]

        for line in lines[:20]:
            if any(k in line.upper() for k in ["BILLING ADDRESS", "SUPPLY TO", "BILL TO", "SHIP TO", "BUYER", "CONSIGNEE"]):
                in_buyer_section = True
                continue
            if in_buyer_section:
                continue
            if any(kw in line.upper() for kw in company_keywords):
                if not any(st in line.upper() for st in skip_terms):
                    clean_vendor = re.sub(r'^(?:M/s\.?|To:?|From:?|Vendor:?|Supplier:?)\s*', '', line, flags=re.IGNORECASE).strip()
                    if len(clean_vendor) > 3:
                        extracted["vendor_name"] = clean_vendor
                        break

    extracted["line_items"] = parse_line_items_heuristics(text_content)
    extracted["dynamic_fields"] = parse_dynamic_fields_heuristics(text_content)

    # If amount is missing or 0 but line items have total, calculate from line items
    if extracted["amount"] == 0.0 and extracted["line_items"]:
        items_total = round(sum(it.get("amount", 0.0) for it in extracted["line_items"]), 2)
        if items_total > 0:
            extracted["amount"] = items_total
            if extracted["base_amount"] == 0.0:
                extracted["base_amount"] = round(items_total / 1.18, 2)
                extracted["tax_amount"] = round(items_total - extracted["base_amount"], 2)

    return extracted



def parse_line_items_heuristics(text_content: str) -> List[Dict[str, Any]]:
    """Deterministic heuristic extraction of invoice line items table."""
    items: List[Dict[str, Any]] = []
    if not text_content:
        return items

    lines = [l.strip() for l in text_content.split('\n') if l.strip()]

    # 1. Check for single horizontal lines matching table row:
    # e.g.: 1  PVC JUNCTION BOX 5 X 5  85044090  4  25.00  100.00
    row_pattern = re.compile(
        r'^\s*(\d+)\s+(.+?)\s+([0-9]{4,8})\s+(\d+(?:\.\d+)?)\s+([0-9,]+(?:\.[0-9]{2})?)\s+([0-9,]+(?:\.[0-9]{2})?)\s*$'
    )
    for line in lines:
        m = row_pattern.match(line)
        if m:
            s_no, desc, hsn, qty, rate, amt = m.groups()
            items.append({
                "s_no": int(s_no),
                "description": desc.strip(),
                "hsn_sac": hsn.strip(),
                "quantity": float(qty),
                "rate": float(rate.replace(',', '')),
                "amount": float(amt.replace(',', ''))
            })

    if items:
        return items

    # 2. Check for vertical / multi-token table OCR sequence (e.g. PaddleOCR vertical text)
    # Detects headers like S.No, Description, HSN/SAC, Qty, Rate, Amount followed by rows.
    start_idx = -1
    for i, line in enumerate(lines):
        clean = line.lower().replace('/', '').replace('.', '').replace(' ', '')
        if "sno" in clean or "slno" in clean or "itemno" in clean:
            window = [l.lower() for l in lines[i:i+8]]
            if any("desc" in w or "particular" in w for w in window) and (any("qty" in w or "quantity" in w for w in window) or any("rate" in w or "amount" in w for w in window)):
                start_idx = i
                break

    if start_idx != -1:
        idx = start_idx
        # Skip header lines
        while idx < len(lines):
            clean = lines[idx].lower()
            if any(h in clean for h in ["s.no", "sl.no", "description", "particular", "hsn", "sac", "qty", "quantity", "rate", "unit price", "amount", "total", "-"]):
                idx += 1
            else:
                break

        data_tokens = lines[idx:]
        t_i = 0
        s_counter = 1
        while t_i < len(data_tokens):
            tok = data_tokens[t_i]
            if tok.isdigit() or tok in ["-", "*", "."]:
                cur_sno = int(tok) if tok.isdigit() else s_counter
                t_i += 1
            else:
                cur_sno = s_counter

            if t_i >= len(data_tokens):
                break

            desc = data_tokens[t_i]
            t_i += 1
            if t_i >= len(data_tokens):
                break

            hsn = ""
            qty = 1.0
            rate = 0.0
            amt = 0.0

            # Next token might be HSN (4 to 8 digits)
            if t_i < len(data_tokens) and re.match(r'^\d{4,8}$', data_tokens[t_i]):
                hsn = data_tokens[t_i]
                t_i += 1

            # Next token might be Qty
            if t_i < len(data_tokens) and re.match(r'^\d+(?:\.\d+)?$', data_tokens[t_i]):
                qty = float(data_tokens[t_i])
                t_i += 1

            # Next token might be Rate
            if t_i < len(data_tokens) and re.match(r'^\d+(?:\.\d+)?$', data_tokens[t_i].replace(',', '')):
                rate = float(data_tokens[t_i].replace(',', ''))
                t_i += 1

            # Next token might be Amount
            if t_i < len(data_tokens) and re.match(r'^\d+(?:\.\d+)?$', data_tokens[t_i].replace(',', '')):
                amt = float(data_tokens[t_i].replace(',', ''))
                t_i += 1

            if amt == 0.0 and rate > 0:
                amt = round(qty * rate, 2)
            elif rate == 0.0 and amt > 0 and qty > 0:
                rate = round(amt / qty, 2)

            if desc and (amt > 0 or qty > 0 or hsn):
                items.append({
                    "s_no": cur_sno,
                    "description": desc,
                    "hsn_sac": hsn,
                    "quantity": qty,
                    "rate": rate,
                    "amount": amt
                })
                s_counter += 1

    return items


def parse_dynamic_fields_heuristics(text_content: str) -> Dict[str, Any]:
    """Deterministic extraction of extra dynamic invoice metadata."""
    dynamic: Dict[str, Any] = {}
    if not text_content:
        return dynamic

    patterns = {
        "buyer_name": r'(?:Buyer|Bill\s*To|Consignee|Customer|Ship\s*To)(?:\s*Name)?[ \t]*[:\-][ \t]*([^\n\r]+)',
        "buyer_gstin": r'(?:Buyer|Bill\s*To|Consignee|Customer)?\s*(?:GSTIN|GST\s*No|GSTIN\/UIN)[ \t]*[:\-][ \t]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})',
        "vehicle_number": r'(?:Vehicle\s*No\.?|Vehicle\s*Number|Truck\s*No\.?|Lorry\s*No\.?)[ \t]*[:\-][ \t]*([A-Z0-9\-\s]{5,18})',
        "eway_bill_no": r'(?:E-?Way\s*Bill\s*(?:No\.?|Number)|EWB\s*No\.?)[ \t]*[:\-][ \t]*([0-9]{10,16})',
        "delivery_note": r'(?:Delivery\s*Note|Challan\s*No\.?|DC\s*No\.?)[ \t]*[:\-][ \t]*([A-Za-z0-9\-\/]{2,30})',
        "payment_terms": r'(?:Payment\s*Terms|Terms\s*of\s*Payment|Terms\s*of\s*Delivery)[ \t]*[:\-][ \t]*([^\n\r]{3,60})',
        "bank_account": r'(?:Bank\s*A\/c\s*No\.?|Account\s*No\.?|A\/c\s*No\.?)[ \t]*[:\-][ \t]*([0-9]{9,20})',
        "bank_ifsc": r'(?:IFSC(?:\s*Code)?)[ \t]*[:\-][ \t]*([A-Z]{4}0[A-Z0-9]{6})',
        "bank_name": r'(?:Bank\s*Name)[ \t]*[:\-][ \t]*([^\n\r]{3,50})',
        "place_of_supply": r'(?:Place\s*of\s*Supply|State\s*Name)[ \t]*[:\-][ \t]*([^\n\r]{2,40})',
    }

    for key, pat in patterns.items():
        m = re.search(pat, text_content, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            if len(val) >= 2 and val.lower() not in ["null", "none", "n/a", "-", "buyer", "consignee"]:
                dynamic[key] = val

    return dynamic

def _clean_number(val: Any) -> float:
    """Helper to clean string numbers with commas or symbols to float."""
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    try:
        clean = str(val).replace(",", "").replace("INR", "").replace("Rs.", "").replace("₹", "").strip()
        return round(float(clean), 2)
    except Exception:
        return 0.0


def extract_with_llm(text_content: str) -> Optional[Dict[str, Any]]:
    """
    Extract structured invoice fields, line items table, and dynamic custom metadata using local Ollama.
    100% Free, Open-Source, and locally runnable.
    Robust JSON parsing with fallback and field normalization.
    """
    if not text_content or len(text_content.strip()) < 10:
        return None

    snippet = text_content[:4500]
    prompt = (
        "You are an enterprise document extraction AI. Extract the document metadata, line items table, and any dynamic fields from this invoice/document text.\n"
        "Return ONLY a valid JSON object matching these exact keys:\n"
        "{\n"
        '  "vendor_name": string (supplier or vendor name),\n'
        '  "invoice_number": string (invoice/bill number),\n'
        '  "invoice_date": string (ISO date YYYY-MM-DD),\n'
        '  "amount": number (total grand amount),\n'
        '  "base_amount": number (subtotal before tax),\n'
        '  "tax_amount": number (total tax amount),\n'
        '  "cgst": number (CGST amount if applicable, else 0.0),\n'
        '  "sgst": number (SGST amount if applicable, else 0.0),\n'
        '  "igst": number (IGST amount if applicable, else 0.0),\n'
        '  "gstin": string (15-digit GSTIN/tax ID if available),\n'
        '  "po_number": string (purchase order reference if present),\n'
        '  "document_type": string (e.g. "AP INVOICE", "PURCHASE", "TAX INVOICE"),\n'
        '  "division": string (e.g. "VCC", "VCT", "SPINNING", or default "VCC"),\n'
        '  "confidence_score": number (0.0 to 1.0 confidence score),\n'
        '  "line_items": [\n'
        '    {\n'
        '      "s_no": number (item serial number),\n'
        '      "description": string (item name or goods description),\n'
        '      "hsn_sac": string (HSN or SAC code),\n'
        '      "quantity": number,\n'
        '      "rate": number (unit price / rate),\n'
        '      "amount": number (total item amount)\n'
        '    }\n'
        '  ],\n'
        '  "dynamic_fields": {\n'
        '    "custom_field_name": "value"\n'
        '  }\n'
        "}\n\n"
        f"Document Text:\n{snippet}"
    )

    ollama_url = (getattr(settings, "OLLAMA_URL", None) or os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")).strip()
    ollama_model = (getattr(settings, "OLLAMA_MODEL", None) or os.environ.get("OLLAMA_MODEL", "llama3.2:latest")).strip()
    try:
        timeout_sec = float(getattr(settings, "OLLAMA_TIMEOUT", None) or os.environ.get("OLLAMA_TIMEOUT", "30.0"))
    except (ValueError, TypeError):
        timeout_sec = 30.0

    try:
        import httpx
        payload = {
            "model": ollama_model,
            "prompt": prompt,
            "format": "json",
            "stream": False
        }
        with httpx.Client(timeout=timeout_sec) as client:
            res = client.post(ollama_url, json=payload)
            if res.status_code == 200:
                raw_data = res.json()
                raw_reply = raw_data.get("response", "")
                
                # Robust JSON regex match to handle any leading/trailing explanations or markdown
                json_match = re.search(r'\{[\s\S]*\}', raw_reply)
                if not json_match:
                    logger.warning("[Ollama Extraction] No JSON object found in Ollama response: %s", raw_reply[:200])
                    return None

                parsed = json.loads(json_match.group(0))

                # Normalize numeric fields
                for num_key in ["amount", "base_amount", "tax_amount", "cgst", "sgst", "igst"]:
                    parsed[num_key] = _clean_number(parsed.get(num_key))

                # Normalize confidence score
                try:
                    conf = float(parsed.get("confidence_score") or 0.95)
                    parsed["confidence_score"] = min(max(conf, 0.0), 1.0)
                except Exception:
                    parsed["confidence_score"] = 0.95

                # Clean strings
                for str_key in ["vendor_name", "invoice_number", "gstin", "po_number"]:
                    val = parsed.get(str_key)
                    if val is None or str(val).strip().lower() in ["unknown", "null", "none", "n/a", "string", "undefined"]:
                        parsed[str_key] = ""
                    else:
                        parsed[str_key] = str(val).strip()

                # Clean invoice date
                if parsed.get("invoice_date"):
                    raw_date = str(parsed["invoice_date"]).strip()
                    if raw_date.lower() in ["unknown", "null", "none", "n/a", "string", "undefined"]:
                        parsed["invoice_date"] = ""
                    else:
                        parsed["invoice_date"] = parse_date_to_iso(raw_date)

                # Normalize line items table
                raw_items = parsed.get("line_items") or []
                cleaned_items = []
                if isinstance(raw_items, list):
                    for idx, itm in enumerate(raw_items, start=1):
                        if isinstance(itm, dict):
                            desc = str(itm.get("description") or "").strip()
                            if desc and desc.lower() not in ["unknown", "null", "none", "n/a", "string", "item"]:
                                q_val = _clean_number(itm.get("quantity") or 1.0)
                                r_val = _clean_number(itm.get("rate") or itm.get("unit_price") or 0.0)
                                a_val = _clean_number(itm.get("amount") or 0.0)
                                if a_val == 0.0 and q_val > 0 and r_val > 0:
                                    a_val = round(q_val * r_val, 2)
                                elif r_val == 0.0 and a_val > 0 and q_val > 0:
                                    r_val = round(a_val / q_val, 2)
                                s_no = itm.get("s_no")
                                try:
                                    s_no = int(s_no) if s_no is not None else idx
                                except (ValueError, TypeError):
                                    s_no = idx
                                hsn_val = str(itm.get("hsn_sac") or itm.get("hsn") or "").strip()
                                if hsn_val.lower() in ["unknown", "null", "none", "n/a", "string"]:
                                    hsn_val = ""
                                cleaned_items.append({
                                    "s_no": s_no,
                                    "description": desc,
                                    "hsn_sac": hsn_val,
                                    "quantity": q_val if q_val > 0 else 1.0,
                                    "rate": r_val,
                                    "amount": a_val
                                })
                parsed["line_items"] = cleaned_items

                # Normalize dynamic fields dictionary
                raw_dyn = parsed.get("dynamic_fields") or {}
                if isinstance(raw_dyn, dict):
                    parsed["dynamic_fields"] = {
                        str(k).strip(): str(v).strip()
                        for k, v in raw_dyn.items()
                        if v is not None and str(v).strip() != "" and str(k).strip() not in ["vendor_name", "invoice_number", "amount"]
                    }
                else:
                    parsed["dynamic_fields"] = {}

                parsed["extraction_source"] = f"ollama_{ollama_model}"
                logger.info("[Ollama Extraction] Successfully extracted fields using %s (Invoice: %s, Items: %d, Total: %s)",
                            ollama_model, parsed.get("invoice_number"), len(cleaned_items), parsed.get("amount"))
                return parsed
            else:
                logger.warning("[Ollama Extraction] Local Ollama returned status %s: %s", res.status_code, res.text[:200])
    except Exception as exc:
        logger.warning("[Ollama Extraction] Local Ollama call skipped/failed (falling back to OCR rules): %s", exc)

    return None


def extract_document_for_verification(file_path: Path) -> Dict[str, Any]:
    """
    Main extraction pipeline for Manual Upload (Path A).
    Performs OCR, runs LLM data extraction with heuristic fallback, and returns
    a complete structured dictionary for the Human-in-the-Loop verification view,
    including table line items and dynamic document fields.
    Protected by ocr_concurrency_guard to bound concurrent CPU & memory usage.
    """
    with ocr_concurrency_guard():
        raw_text = extract_raw_text(file_path)
        
        # 1. Try LLM extraction first
        llm_data = extract_with_llm(raw_text) if raw_text.strip() else None

        # 2. Extract heuristics from raw text
        heuristic_data = parse_invoice_heuristics(raw_text)

        # 3. Merge results (LLM takes precedence, heuristics fill any gaps)
        final_data = heuristic_data.copy()
        if llm_data:
            for k, v in llm_data.items():
                if k not in ["line_items", "dynamic_fields"] and v is not None and v != "" and v != 0.0:
                    final_data[k] = v

            # Merge line items: LLM takes precedence if non-empty, otherwise heuristics
            if llm_data.get("line_items"):
                final_data["line_items"] = llm_data["line_items"]
            
            # Merge dynamic fields
            dyn_merged = heuristic_data.get("dynamic_fields", {}).copy()
            if llm_data.get("dynamic_fields"):
                dyn_merged.update(llm_data["dynamic_fields"])
            final_data["dynamic_fields"] = dyn_merged

            final_data["extraction_source"] = llm_data.get("extraction_source", "llm")
            final_data["confidence_score"] = float(llm_data.get("confidence_score") or 0.95)

        # Ensure line_items and dynamic_fields always exist
        if "line_items" not in final_data or not final_data["line_items"]:
            final_data["line_items"] = parse_line_items_heuristics(raw_text)
        if "dynamic_fields" not in final_data:
            final_data["dynamic_fields"] = parse_dynamic_fields_heuristics(raw_text)

        # Cross-calculate amount if missing or 0
        if final_data.get("amount", 0.0) == 0.0 and final_data.get("line_items"):
            items_tot = round(sum(it.get("amount", 0.0) for it in final_data["line_items"]), 2)
            if items_tot > 0:
                final_data["amount"] = items_tot
                if final_data.get("base_amount", 0.0) == 0.0:
                    final_data["base_amount"] = round(items_tot / 1.18, 2)
                    final_data["tax_amount"] = round(items_tot - final_data["base_amount"], 2)

        final_data["raw_text_preview"] = raw_text[:1000] if raw_text else ""
        return final_data


def extract_text_from_pdf(pdf_path: Path) -> Dict[str, Any]:
    """
    Backward-compatible extractor for legacy callers (sync attachments, etc.).
    Protected by ocr_concurrency_guard to bound concurrent CPU & memory usage.
    """
    with ocr_concurrency_guard():
        raw_text = extract_raw_text(pdf_path)
        heuristics = parse_invoice_heuristics(raw_text)
        return {
            'raw_text': raw_text,
            'vendor_name': heuristics.get('vendor_name'),
            'invoice_number': heuristics.get('invoice_number'),
            'date': heuristics.get('invoice_date'),
            'amount': heuristics.get('amount', 0.0),
            'gstin': heuristics.get('gstin')
        }
