import re
from pathlib import Path
from typing import Dict, Any

def extract_text_from_pdf(pdf_path: Path) -> Dict[str, Any]:
    text_content = ""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(pdf_path))
        for page in doc:
            text_content += page.get_text() + "\n"
        doc.close()
    except Exception as e:
        print(f"[OCR] PyMuPDF read failed ({e}), using fallback")

    # Simple field parsing heuristics from invoice text
    extracted = {
        "raw_text": text_content,
        "vendor_name": None,
        "invoice_number": None,
        "date": None,
        "amount": 0.0,
        "gstin": None
    }

    # Extract GSTIN (15 character format)
    gst_match = re.search(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b', text_content)
    if gst_match:
        extracted["gstin"] = gst_match.group(0)

    # Extract Invoice Number
    inv_match = re.search(r'(?:Invoice|Bill|Inv)\s*(?:No|#|Number)?[:\s]+([A-Z0-9\-\/]+)', text_content, re.IGNORECASE)
    if inv_match:
        extracted["invoice_number"] = inv_match.group(1)

    # Extract Total Amount
    amt_match = re.search(r'(?:Total|Grand Total|Net Amount|Amount Payable)[:\s]*(?:INR|Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)', text_content, re.IGNORECASE)
    if amt_match:
        try:
            cleaned = amt_match.group(1).replace(",", "")
            extracted["amount"] = float(cleaned)
        except Exception:
            pass

    return extracted
