import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def extract_raw_text(file_path: Path) -> str:
    """Extract raw text from PDF using PyMuPDF (fitz) with OCR fallback."""
    text_content = ""
    suffix = file_path.suffix.lower()
    
    if suffix == ".pdf":
        try:
            import fitz
            doc = fitz.open(str(file_path))
            for page in doc:
                text_content += page.get_text() + "\n"
            doc.close()
        except Exception as e:
            logger.warning("[OCR] fitz text extraction failed: %s", e)

    # If PyMuPDF returned little or no text (e.g. scanned PDF or image), attempt OCR if available
    if len(text_content.strip()) < 30:
        try:
            # Check if paddleocr is available
            from paddleocr import PaddleOCR
            ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
            if suffix == ".pdf":
                # Render first few pages as images using fitz
                import fitz
                doc = fitz.open(str(file_path))
                for page_idx in range(min(len(doc), 3)):
                    page = doc[page_idx]
                    pix = page.get_pixmap()
                    img_bytes = pix.tobytes("png")
                    result = ocr.ocr(img_bytes, cls=True)
                    if result and result[0]:
                        for line in result[0]:
                            if line and len(line) >= 2 and line[1]:
                                text_content += str(line[1][0]) + "\n"
                doc.close()
        except Exception as ocr_err:
            logger.debug("[OCR] Scanned OCR fallback skipped: %s", ocr_err)

    return text_content


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

    # GSTIN extraction (standard 15-char Indian GSTIN format)
    gst_match = re.search(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', text_content)
    if gst_match:
        extracted["gstin"] = gst_match.group(0)

    # Invoice number extraction (requires explicit number indicator or colon on the same line)
    inv_match = re.search(
        r'(?:Invoice|Tax Invoice|Bill|Inv)\s*(?:No\.?|#|Number|Num)?[ \t]*[:\-\#][ \t]*([A-Za-z0-9\-\/]{3,30})',
        text_content,
        re.IGNORECASE
    )
    if not inv_match:
        inv_match = re.search(
            r'(?:Invoice|Bill|Inv)\s+(?:No\.?|#|Number)[ \t]+([A-Za-z0-9\-\/]{3,30})',
            text_content,
            re.IGNORECASE
        )
    if inv_match:
        extracted["invoice_number"] = inv_match.group(1).strip()

    # PO Number extraction
    po_match = re.search(
        r'(?:PO|P\.O\.|Purchase Order)\s*(?:No\.?|#|Number)?[ \t]*[:\-\#]?[ \t]*([A-Za-z0-9\-\/]{3,30})',
        text_content,
        re.IGNORECASE
    )
    if po_match:
        extracted["po_number"] = po_match.group(1).strip()

    # Date extraction (supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD-MMM-YYYY)
    date_match = re.search(
        r'(?:Date|Invoice Date|Dated)[ \t]*[:\-]?[ \t]*([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4}|[0-9]{4}[/\-\.][0-9]{1,2}[/\-\.][0-9]{1,2})',
        text_content,
        re.IGNORECASE
    )
    if date_match:
        raw_date = date_match.group(1).strip().replace('.', '-').replace('/', '-')
        parts = raw_date.split('-')
        if len(parts) == 3:
            if len(parts[0]) == 4:  # YYYY-MM-DD
                extracted["invoice_date"] = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
            elif len(parts[2]) == 4:  # DD-MM-YYYY
                extracted["invoice_date"] = f"{parts[2]}-{int(parts[1]):02d}-{int(parts[0]):02d}"

    # Amount extraction (handles "Total Amount:", "Grand Total:", "Net Payable:", etc.)
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
            extracted["base_amount"] = round(amt_val / 1.18, 2)
            extracted["tax_amount"] = round(amt_val - extracted["base_amount"], 2)
        except Exception as exc:
            logger.debug("Failed parsing regex amount match: %s", exc)

    # Taxes extraction
    for tax_name in ["cgst", "sgst", "igst"]:
        tax_m = re.search(
            rf'(?:{tax_name})[ \t]*[:\-]?[ \t]*(?:INR|Rs\.?|₹)?[ \t]*([0-9,]+(?:\.[0-9]{2})?)',
            text_content,
            re.IGNORECASE
        )
        if tax_m:
            try:
                extracted[tax_name] = round(float(tax_m.group(1).replace(',', '')), 2)
            except Exception as exc:
                logger.debug("Failed parsing regex %s match: %s", tax_name, exc)

    # Vendor extraction heuristics: look for company indicators in first 12 lines
    lines = [l.strip() for l in text_content.split('\n') if l.strip()]
    for line in lines[:12]:
        if any(keyword in line.upper() for keyword in ["PVT", "LTD", "LIMITED", "ENTERPRISES", "CORP", "INDUSTRIES", "TRADERS", "SUPPLIERS", "M/S"]):
            # Filter out generic document labels
            if not any(k in line.upper() for k in ["TAX INVOICE", "ORIGINAL", "DUPLICATE", "BUYER", "CONSIGNEE", "CUSTOMER"]):
                clean_vendor = re.sub(r'^(?:M/s\.?|To:?|From:?|Vendor:?|Supplier:?)\s*', '', line, flags=re.IGNORECASE).strip()
                if len(clean_vendor) > 3:
                    extracted["vendor_name"] = clean_vendor
                    break


    return extracted


def extract_with_llm(text_content: str) -> Optional[Dict[str, Any]]:
    """
    Extract structured invoice fields using local Ollama (qwen3:8b).
    100% Free, Open-Source, and locally runnable. Zero paid/external API calls.
    """
    if not text_content or len(text_content.strip()) < 10:
        return None

    snippet = text_content[:4000]
    prompt = (
        "You are an enterprise document extraction AI. Extract the key metadata from this invoice/document text.\n"
        "Return ONLY a valid JSON object with these exact keys:\n"
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
        '  "document_type": string (e.g. "AP INVOICE", "PURCHASE", "SERVICE INVOICE"),\n'
        '  "division": string (e.g. "VCC", "VCT", "SPINNING", or default "VCC"),\n'
        '  "confidence_score": number (0.0 to 1.0 confidence score)\n'
        "}\n\n"
        f"Document Text:\n{snippet}"
    )

    ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
    ollama_model = os.environ.get("OLLAMA_MODEL", "qwen3:8b")

    try:
        import httpx
        payload = {
            "model": ollama_model,
            "prompt": prompt,
            "format": "json",
            "stream": False
        }
        with httpx.Client(timeout=60.0) as client:
            res = client.post(ollama_url, json=payload)
            if res.status_code == 200:
                raw_data = res.json()
                raw_reply = raw_data.get("response", "")
                clean_reply = re.sub(r'^```(?:json)?\s*', '', raw_reply.strip())
                clean_reply = re.sub(r'\s*```$', '', clean_reply).strip()
                parsed = json.loads(clean_reply)
                parsed["extraction_source"] = f"ollama_{ollama_model}"
                return parsed
            else:
                logger.warning("[Ollama Extraction] Local Ollama returned status %s: %s", res.status_code, res.text[:200])
    except Exception as exc:
        logger.warning("[Ollama Extraction] Local Ollama call failed, falling back to PaddleOCR heuristics: %s", exc)

    return None



def extract_document_for_verification(file_path: Path) -> Dict[str, Any]:
    """
    Main extraction pipeline for Manual Upload (Path A).
    Performs OCR, runs LLM data extraction with heuristic fallback, and returns
    a complete structured dictionary for the Human-in-the-Loop verification view.
    """
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
    """
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