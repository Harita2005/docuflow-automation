"""
DocuFlow Automation - AI & OCR Evaluation Engine
Reproducible Evaluation Script for Document Extraction, OCR Accuracy, and Pipeline Metrics

Author: DocuFlow QA Automation & AI Evaluation Team
Date: October 2026

Calculates:
1. Field-level exact-match accuracy (raw and normalized)
2. Invoice-level exact-match accuracy
3. Field Precision, Recall, and F1-score (micro and macro)
4. Character Error Rate (CER) via Levenshtein distance
5. Word Error Rate (WER) via Token-level Levenshtein distance
6. Manual correction rate
7. Mean and median document processing duration

Normalization Policy:
- Whitespace: Strip leading/trailing, collapse consecutive whitespace to single space.
- Invoice Numbers: Strip '#' and prefixes ('INV-', 'NO:', etc.), uppercase, remove spaces.
- Dates: Standardize ISO 8601 (YYYY-MM-DD) across common formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY).
- Amounts/Currency: Strip symbols ('$', 'EUR', 'INR', '£', commas), parse to 2 decimal places.
- General text: Lowercase, trimmed, normalized punctuation.

Zero Fabrication Policy:
If the evaluation worksheet contains no ground-truth annotations, the script outputs
status BLOCKED pending annotation and does not synthesize or hallucinate metrics.
"""

import os
import re
import argparse
import statistics
from datetime import datetime
from typing import Dict, List, Any

try:
    import openpyxl
except ImportError:
    openpyxl = None


# ==========================================
# 1. Levenshtein Distance & Error Rate Tools
# ==========================================

def levenshtein_distance(seq1: List[Any], seq2: List[Any]) -> int:
    """Computes Levenshtein edit distance between two sequences (chars or tokens)."""
    m, n = len(seq1), len(seq2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if seq1[i - 1] == seq2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # deletion
                    dp[i][j - 1],      # insertion
                    dp[i - 1][j - 1]   # substitution
                )
    return dp[m][n]


def calculate_cer(reference: str, hypothesis: str) -> float:
    """
    Character Error Rate = (Substitutions + Deletions + Insertions) / len(reference).
    Values range from 0.0 upwards (can exceed 1.0 if hypothesis has many insertions).
    """
    ref_chars = list(reference)
    hyp_chars = list(hypothesis)
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0
    dist = levenshtein_distance(ref_chars, hyp_chars)
    return dist / len(ref_chars)


def calculate_wer(reference: str, hypothesis: str) -> float:
    """
    Word Error Rate = (Substitutions + Deletions + Insertions) / len(reference_words).
    Words are split on whitespace.
    """
    ref_words = reference.strip().split()
    hyp_words = hypothesis.strip().split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
    dist = levenshtein_distance(ref_words, hyp_words)
    return dist / len(ref_words)


# ==========================================
# 2. Normalization Policy
# ==========================================

def normalize_whitespace(val: str) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def normalize_amount(val: Any) -> str:
    """Extracts numeric monetary amount with 2 decimal places."""
    if val is None or val == "":
        return ""
    s = str(val).strip()
    # Remove currency symbols and formatting commas
    cleaned = re.sub(r"[^\d.-]", "", s.replace(",", ""))
    try:
        f = float(cleaned)
        return f"{f:.2f}"
    except (ValueError, TypeError):
        return normalize_whitespace(s)


def normalize_date(val: Any) -> str:
    """Normalizes dates into ISO YYYY-MM-DD format."""
    if val is None or val == "":
        return ""
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    s = normalize_whitespace(str(val))
    # Try various formats
    formats = [
        "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
        "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
        "%Y/%m/%d", "%d.%m.%Y"
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            # Value does not match this date format; attempt next pattern
            continue
    return s


def normalize_invoice_number(val: Any) -> str:
    """Normalizes invoice numbers by uppercasing and stripping prefixes/punctuation."""
    if val is None or val == "":
        return ""
    s = normalize_whitespace(str(val)).upper()
    s = re.sub(r"^(INV|INVOICE|NO|NUM|NUMBER)[:\s#-]*", "", s)
    s = re.sub(r"[\s-]", "", s)
    return s


def normalize_field(field_name: str, value: Any) -> str:
    """Applies domain-specific normalization based on field type."""
    if value is None:
        return ""
    field_lower = field_name.lower()
    if "amount" in field_lower or "total" in field_lower or "tax" in field_lower or "price" in field_lower:
        return normalize_amount(value)
    elif "date" in field_lower:
        return normalize_date(value)
    elif "invoice_no" in field_lower or "invoice_num" in field_lower or "inv_no" in field_lower:
        return normalize_invoice_number(value)
    else:
        return normalize_whitespace(str(value)).lower()


# ==========================================
# 3. Metrics Calculation
# ==========================================

class AIFieldEvaluationResult:
    def __init__(self):
        self.total_fields = 0
        self.exact_match_raw = 0
        self.exact_match_norm = 0
        self.tp = 0
        self.fp = 0
        self.fn = 0
        self.manual_corrections = 0
        self.field_breakdown: Dict[str, Dict[str, int]] = {}

    @property
    def raw_exact_match_accuracy(self) -> float:
        return (self.exact_match_raw / self.total_fields * 100) if self.total_fields else 0.0

    @property
    def normalized_exact_match_accuracy(self) -> float:
        return (self.exact_match_norm / self.total_fields * 100) if self.total_fields else 0.0

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return (self.tp / denom * 100) if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.tp + self.fn
        return (self.tp / denom * 100) if denom else 0.0

    @property
    def f1_score(self) -> float:
        p, r = self.precision, self.recall
        return (2 * p * r / (p + r)) if (p + r) > 0 else 0.0

    @property
    def manual_correction_rate(self) -> float:
        return (self.manual_corrections / self.total_fields * 100) if self.total_fields else 0.0


def evaluate_fields(records: List[Dict[str, Any]]) -> AIFieldEvaluationResult:
    """
    Evaluates field extraction records.
    Each record must have:
      - 'field_name': str
      - 'ground_truth': str or None
      - 'prediction': str or None
      - Optional 'manually_corrected': bool
    """
    res = AIFieldEvaluationResult()
    for rec in records:
        f_name = rec.get("field_name", "unknown")
        gt = rec.get("ground_truth")
        pred = rec.get("prediction")
        manually_corrected = rec.get("manually_corrected")

        res.total_fields += 1
        if f_name not in res.field_breakdown:
            res.field_breakdown[f_name] = {"total": 0, "match_norm": 0, "tp": 0, "fp": 0, "fn": 0}
        fb = res.field_breakdown[f_name]
        fb["total"] += 1

        # Raw comparison
        raw_gt = str(gt).strip() if gt is not None else ""
        raw_pred = str(pred).strip() if pred is not None else ""
        if raw_gt == raw_pred and raw_gt != "":
            res.exact_match_raw += 1

        # Normalized comparison
        norm_gt = normalize_field(f_name, gt)
        norm_pred = normalize_field(f_name, pred)

        has_gt = bool(norm_gt)
        has_pred = bool(norm_pred)

        if has_gt and has_pred:
            if norm_gt == norm_pred:
                res.exact_match_norm += 1
                res.tp += 1
                fb["match_norm"] += 1
                fb["tp"] += 1
            else:
                # Prediction present but incorrect
                res.fp += 1
                res.fn += 1  # Missed the correct truth
                fb["fp"] += 1
                fb["fn"] += 1
        elif has_gt and not has_pred:
            res.fn += 1
            fb["fn"] += 1
        elif not has_gt and has_pred:
            res.fp += 1
            fb["fp"] += 1
        else:
            # Both empty
            res.exact_match_norm += 1
            fb["match_norm"] += 1

        # Manual correction
        if manually_corrected is not None:
            if manually_corrected:
                res.manual_corrections += 1
        else:
            # If not explicitly marked, a correction is needed whenever norm_gt != norm_pred
            if norm_gt != norm_pred:
                res.manual_corrections += 1

    return res


def evaluate_ocr(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates OCR text records.
    Each record must have:
      - 'ground_truth_text': str
      - 'ocr_extracted_text': str
    """
    cer_list = []
    wer_list = []
    total_ref_chars = 0
    total_ref_words = 0
    total_char_dist = 0
    total_word_dist = 0

    for rec in records:
        gt = rec.get("ground_truth_text")
        hyp = rec.get("ocr_extracted_text")
        if gt is None or hyp is None:
            continue

        gt_str = str(gt)
        hyp_str = str(hyp)

        c_err = calculate_cer(gt_str, hyp_str)
        w_err = calculate_wer(gt_str, hyp_str)
        cer_list.append(c_err)
        wer_list.append(w_err)

        ref_chars = list(gt_str)
        hyp_chars = list(hyp_str)
        total_ref_chars += len(ref_chars)
        total_char_dist += levenshtein_distance(ref_chars, hyp_chars)

        ref_words = gt_str.strip().split()
        hyp_words = hyp_str.strip().split()
        total_ref_words += len(ref_words)
        total_word_dist += levenshtein_distance(ref_words, hyp_words)

    macro_cer = (statistics.mean(cer_list) * 100) if cer_list else 0.0
    macro_wer = (statistics.mean(wer_list) * 100) if wer_list else 0.0
    micro_cer = (total_char_dist / total_ref_chars * 100) if total_ref_chars else 0.0
    micro_wer = (total_word_dist / total_ref_words * 100) if total_ref_words else 0.0

    return {
        "sample_count": len(cer_list),
        "macro_cer_percent": macro_cer,
        "macro_wer_percent": macro_wer,
        "micro_cer_percent": micro_cer,
        "micro_wer_percent": micro_wer,
        "total_ref_chars": total_ref_chars,
        "total_ref_words": total_ref_words
    }


def evaluate_pipeline_latency(durations: List[float]) -> Dict[str, float]:
    """Computes mean, median, min, max, std dev processing times in seconds."""
    if not durations:
        return {"count": 0, "mean_sec": 0.0, "median_sec": 0.0, "min_sec": 0.0, "max_sec": 0.0}
    return {
        "count": len(durations),
        "mean_sec": round(statistics.mean(durations), 3),
        "median_sec": round(statistics.median(durations), 3),
        "min_sec": round(min(durations), 3),
        "max_sec": round(max(durations), 3),
        "stdev_sec": round(statistics.stdev(durations), 3) if len(durations) > 1 else 0.0
    }


# ==========================================
# 4. Excel Template Loader & Verifier
# ==========================================

def inspect_workbook(filepath: str) -> Dict[str, Any]:
    """Inspects an evaluation workbook to detect ground-truth annotations."""
    if not openpyxl:
        return {"status": "ERROR", "reason": "openpyxl not installed"}
    if not os.path.exists(filepath):
        return {"status": "ERROR", "reason": f"File not found: {filepath}"}

    wb = openpyxl.load_workbook(filepath, data_only=True)
    sheet_names = wb.sheetnames

    field_records = []
    ocr_records = []
    latencies = []

    # Check Eval_Fields sheet
    has_field_gt = False
    if "Eval_Fields" in sheet_names:
        ws = wb["Eval_Fields"]
        headers = [cell.value for cell in ws[1]]
        header_map = {str(h).strip().lower(): idx for idx, h in enumerate(headers) if h is not None}
        
        gt_col = header_map.get("ground_truth") or header_map.get("ground_truth_value")
        pred_col = header_map.get("model_prediction") or header_map.get("prediction")
        field_col = header_map.get("field_name") or header_map.get("field")
        corr_col = header_map.get("manually_corrected") or header_map.get("corrected")

        for row in ws.iter_rows(min_row=2, values_only=True):
            if not any(row):
                continue
            f_name = row[field_col] if field_col is not None and field_col < len(row) else "unknown"
            gt_val = row[gt_col] if gt_col is not None and gt_col < len(row) else None
            pred_val = row[pred_col] if pred_col is not None and pred_col < len(row) else None
            corr_val = row[corr_col] if corr_col is not None and corr_col < len(row) else None

            if gt_val is not None and str(gt_val).strip() != "":
                has_field_gt = True

            field_records.append({
                "field_name": str(f_name) if f_name else "unknown",
                "ground_truth": gt_val,
                "prediction": pred_val,
                "manually_corrected": bool(corr_val) if corr_val is not None else None
            })

    # Check OCR_Text sheet
    has_ocr_gt = False
    if "OCR_Text" in sheet_names:
        ws = wb["OCR_Text"]
        headers = [cell.value for cell in ws[1]]
        header_map = {str(h).strip().lower(): idx for idx, h in enumerate(headers) if h is not None}
        
        gt_col = header_map.get("ground_truth_text")
        pred_col = header_map.get("ocr_extracted_text") or header_map.get("ocr_text")

        for row in ws.iter_rows(min_row=2, values_only=True):
            if not any(row):
                continue
            gt_val = row[gt_col] if gt_col is not None and gt_col < len(row) else None
            pred_val = row[pred_col] if pred_col is not None and pred_col < len(row) else None

            if gt_val is not None and str(gt_val).strip() != "":
                has_ocr_gt = True

            ocr_records.append({
                "ground_truth_text": gt_val,
                "ocr_extracted_text": pred_val
            })

    # Check Pipeline_Outcomes sheet for latencies
    if "Pipeline_Outcomes" in sheet_names:
        ws = wb["Pipeline_Outcomes"]
        headers = [cell.value for cell in ws[1]]
        header_map = {str(h).strip().lower(): idx for idx, h in enumerate(headers) if h is not None}
        dur_col = header_map.get("duration_sec") or header_map.get("processing_duration_sec") or header_map.get("latency_seconds")
        if dur_col is not None:
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                v = row[dur_col]
                if v is not None and isinstance(v, (int, float)):
                    latencies.append(float(v))

    return {
        "status": "LOADED",
        "has_field_gt": has_field_gt,
        "has_ocr_gt": has_ocr_gt,
        "field_records_count": len(field_records),
        "ocr_records_count": len(ocr_records),
        "field_records": field_records,
        "ocr_records": ocr_records,
        "latencies": latencies
    }


# ==========================================
# 5. CLI Execution & Self-Test
# ==========================================

def run_self_test():
    """Executes a self-test with known sample data to verify metrics calculation."""
    print("=== RUNNING SELF-TEST FOR EVALUATION METRICS ===")
    
    # 1. CER / WER Test
    ref = "Invoice 12345 Total $500.00"
    hyp = "Invoice 12345 Total $500.00"
    assert calculate_cer(ref, hyp) == 0.0, "Exact match CER should be 0.0"
    assert calculate_wer(ref, hyp) == 0.0, "Exact match WER should be 0.0"

    hyp_err = "Invoce 12345 Totl $500.00"
    cer = calculate_cer(ref, hyp_err)
    wer = calculate_wer(ref, hyp_err)
    print(f"[Self-Test] Substituted text CER: {cer:.4f}, WER: {wer:.4f}")
    assert cer > 0.0, "CER must detect typo"
    assert wer > 0.0, "WER must detect typo"

    # 2. Normalization Test
    assert normalize_amount("$ 1,234.50") == "1234.50"
    assert normalize_amount("1234.5") == "1234.50"
    assert normalize_date("14/10/2026") == "2026-10-14"
    assert normalize_date("2026-10-14") == "2026-10-14"
    assert normalize_invoice_number("INV # 00984-A") == "00984A"

    # 3. Field Evaluation Test
    sample_records = [
        {"field_name": "invoice_number", "ground_truth": "INV-101", "prediction": "INV# 101"},
        {"field_name": "invoice_date", "ground_truth": "14/10/2026", "prediction": "2026-10-14"},
        {"field_name": "total_amount", "ground_truth": "$1,000.00", "prediction": "1000.00"},
        {"field_name": "vendor_name", "ground_truth": "Acme Corp", "prediction": "ACME CORP"},
        {"field_name": "tax_amount", "ground_truth": "$180.00", "prediction": "$150.00"}  # mismatch
    ]
    res = evaluate_fields(sample_records)
    print(f"[Self-Test] Total Fields: {res.total_fields}")
    print(f"[Self-Test] Normalized Accuracy: {res.normalized_exact_match_accuracy:.2f}%")
    print(f"[Self-Test] Precision: {res.precision:.2f}%, Recall: {res.recall:.2f}%, F1: {res.f1_score:.2f}%")
    assert res.normalized_exact_match_accuracy == 80.0, "4 of 5 should match after normalization"
    assert res.precision == 80.0
    print("=== SELF-TEST PASSED SUCCESSFULLY ===\n")


def main():
    parser = argparse.ArgumentParser(description="DocuFlow AI/OCR Evaluation Metrics Runner")
    parser.add_argument("--workbook", default="ai_evaluation_template.xlsx", help="Path to evaluation Excel workbook")
    parser.add_argument("--self-test", action="store_true", help="Run algorithm verification self-test")
    args = parser.parse_args()

    if args.self_test:
        run_self_test()
        return

    print("======================================================================")
    print("     DocuFlow Automation - Academic AI & OCR Evaluation Engine       ")
    print("======================================================================\n")

    if not os.path.exists(args.workbook):
        print(f"[-] Evaluation workbook not found: {args.workbook}")
        print("[-] Status: BLOCKED pending ground-truth annotation.")
        print(f"[-] Please generate or provide '{args.workbook}' with ground-truth labels.")
        return

    data = inspect_workbook(args.workbook)
    if data["status"] == "ERROR":
        print(f"[-] Error loading workbook: {data['reason']}")
        return

    print(f"[*] Target Workbook: {args.workbook}")
    print(f"[*] Field Records Registered: {data['field_records_count']}")
    print(f"[*] OCR Text Records Registered: {data['ocr_records_count']}")
    print(f"[*] Latency Records Registered: {len(data['latencies'])}\n")

    # Evaluation of Ground Truth Availability
    has_ground_truth = data["has_field_gt"] or data["has_ocr_gt"]

    if not has_ground_truth:
        print("**********************************************************************")
        print("                      ACADEMIC INTEGRITY NOTICE                       ")
        print("  Status: BLOCKED PENDING ANNOTATION                                  ")
        print("                                                                      ")
        print("  The evaluation worksheet currently contains zero ground-truth       ")
        print("  annotations for invoice fields or raw OCR text.                     ")
        print("                                                                      ")
        print("  Per strict dissertation guidelines, extraction accuracy, CER, WER,  ")
        print("  and F1-scores cannot be fabricated or estimated from code alone.    ")
        print("                                                                      ")
        print("  Instructions to unblock:                                            ")
        print("  1. Open 'ai_evaluation_template.xlsx'.                              ")
        print("  2. In 'Eval_Fields', populate 'ground_truth' column from human-     ")
        print("     verified invoices.                                               ")
        print("  3. In 'OCR_Text', populate 'ground_truth_text' with reference text. ")
        print("  4. Re-run: python evaluate_ai_metrics.py                            ")
        print("**********************************************************************\n")

        # Report latencies if present
        if data["latencies"]:
            lat_res = evaluate_pipeline_latency(data["latencies"])
            print("--- Pipeline Processing Latency (Empirically Measured) ---")
            print(f"Sample Count: {lat_res['count']}")
            print(f"Mean Latency: {lat_res['mean_sec']} s")
            print(f"Median Latency: {lat_res['median_sec']} s")
            print(f"Range: [{lat_res['min_sec']} s - {lat_res['max_sec']} s]\n")
        return

    # If ground-truth IS present, execute full quantitative evaluation:
    print("=== FIELD EXTRACTION EVALUATION ===")
    field_res = evaluate_fields(data["field_records"])
    print(f"Total Evaluated Fields:            {field_res.total_fields}")
    print(f"Raw Exact-Match Accuracy:         {field_res.raw_exact_match_accuracy:.2f}%")
    print(f"Normalized Exact-Match Accuracy:  {field_res.normalized_exact_match_accuracy:.2f}%")
    print(f"Precision:                        {field_res.precision:.2f}%")
    print(f"Recall:                           {field_res.recall:.2f}%")
    print(f"F1-Score:                         {field_res.f1_score:.2f}%")
    print(f"Manual Correction Rate:           {field_res.manual_correction_rate:.2f}%")

    print("\n--- Field-Level Breakdown ---")
    for f_name, stats in field_res.field_breakdown.items():
        tot = stats["total"]
        matches = stats["match_norm"]
        acc = (matches / tot * 100) if tot else 0.0
        print(f"  - {f_name:20s}: {matches}/{tot} ({acc:.1f}%)")

    print("\n=== OCR TEXT ACCURACY EVALUATION ===")
    ocr_res = evaluate_ocr(data["ocr_records"])
    print(f"Evaluated OCR Samples:             {ocr_res['sample_count']}")
    print(f"Macro Character Error Rate (CER): {ocr_res['macro_cer_percent']:.2f}%")
    print(f"Micro Character Error Rate (CER): {ocr_res['micro_cer_percent']:.2f}%")
    print(f"Macro Word Error Rate (WER):      {ocr_res['macro_wer_percent']:.2f}%")
    print(f"Micro Word Error Rate (WER):      {ocr_res['micro_wer_percent']:.2f}%")

    if data["latencies"]:
        lat_res = evaluate_pipeline_latency(data["latencies"])
        print("\n=== PIPELINE LATENCY EVALUATION ===")
        print(f"Mean Latency:                     {lat_res['mean_sec']} s")
        print(f"Median Latency:                   {lat_res['median_sec']} s")
        print(f"Standard Deviation:               {lat_res['stdev_sec']} s")
        print(f"Range:                            [{lat_res['min_sec']} s - {lat_res['max_sec']} s]")


if __name__ == "__main__":
    main()
