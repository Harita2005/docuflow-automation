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

    return extracted


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
    Extract structured invoice fields using local Ollama.
    100% Free, Open-Source, and locally runnable.
    Robust JSON parsing with fallback and field normalization.
    """
    if not text_content or len(text_content.strip()) < 10:
        return None

    snippet = text_content[:4000]
    prompt = (
        "You are an enterprise document extraction AI. Extract the key metadata from this invoice/document text.\n"
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
        '  "confidence_score": number (0.0 to 1.0 confidence score)\n'
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
                    if parsed.get(str_key) is None:
                        parsed[str_key] = ""
                    else:
                        parsed[str_key] = str(parsed[str_key]).strip()

                # Clean invoice date
                if parsed.get("invoice_date"):
                    parsed["invoice_date"] = parse_date_to_iso(str(parsed["invoice_date"]))

                parsed["extraction_source"] = f"ollama_{ollama_model}"
                logger.info("[Ollama Extraction] Successfully extracted fields using %s (Invoice: %s, Total: %s)",
                            ollama_model, parsed.get("invoice_number"), parsed.get("amount"))
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
    a complete structured dictionary for the Human-in-the-Loop verification view.
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
                if v is not None and v != "" and v != 0.0:
                    final_data[k] = v
            final_data["extraction_source"] = llm_data.get("extraction_source", "llm")
            final_data["confidence_score"] = float(llm_data.get("confidence_score") or 0.95)

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
