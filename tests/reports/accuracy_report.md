# OCR & AI Extraction Accuracy Report

- **Total Records in Template**: 3
- **Annotated Ground-Truth Records**: 1
- **Unannotated Records (Status BLOCKED)**: 2
- **Overall Normalized Field Accuracy**: 100.0%

## Field-Level Accuracy Statistics

| Field Name | Annotated Count | Exact Match | Normalized Match | Missing | Accuracy (%) |
|---|---|---|---|---|---|
| `invoice_number` | 1 | 1 | 1 | 0 | 100.0% |
| `invoice_date` | 1 | 1 | 1 | 0 | 100.0% |
| `vendor_name` | 1 | 0 | 1 | 0 | 100.0% |
| `po_number` | 1 | 1 | 1 | 0 | 100.0% |
| `base_amount` | 1 | 0 | 1 | 0 | 100.0% |
| `tax_amount` | 1 | 0 | 1 | 0 | 100.0% |
| `amount` | 1 | 0 | 1 | 0 | 100.0% |
| `gstin` | 1 | 1 | 1 | 0 | 100.0% |

## Record-Level Execution Outcomes

| Invoice ID | File Path | Status | Notes |
|---|---|---|---|
| `SAMPLE-INV-001` | `tests/accuracy/sample_invoice.txt` | **PASS** | 0 mismatches |
| `TEMPLATE-INV-002` | `stored_pdfs/CAPEX-9901.pdf` | **BLOCKED** | Pending ground truth annotation |
| `TEMPLATE-INV-003` | `stored_pdfs/DOC-3STAGE-01.pdf` | **BLOCKED** | Pending ground truth annotation |
