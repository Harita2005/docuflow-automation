import csv
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.ocr_service import parse_invoice_heuristics, extract_raw_text


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes Levenshtein edit distance between two strings."""
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]


def calculate_cer(reference: str, hypothesis: str) -> float:
    """Character Error Rate = Levenshtein(chars) / len(reference)."""
    if not reference:
        return 0.0 if not hypothesis else 1.0
    return levenshtein_distance(reference, hypothesis) / len(reference)


def calculate_wer(reference: str, hypothesis: str) -> float:
    """Word Error Rate = Levenshtein(words) / len(reference_words)."""
    ref_words = reference.strip().split()
    hyp_words = hypothesis.strip().split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
    m, n = len(ref_words), len(hyp_words)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n] / len(ref_words)


def normalize_val(val: Any) -> str:
    """Normalizes string or numeric value for fair comparison."""
    if val is None:
        return ""
    s = str(val).strip()
    s = re.sub(r"\s+", " ", s)
    return s.lower()


def evaluate_accuracy(csv_path: Optional[Path] = None, output_dir: Optional[Path] = None) -> Dict[str, Any]:
    """
    Evaluates extraction accuracy against ground-truth template.
    Distinguishes PASS, FAIL, and BLOCKED (pending annotation).
    """
    csv_file = csv_path or (Path(__file__).parent / "ground_truth_template.csv")
    out_dir = output_dir or (Path(__file__).parent.parent / "reports")
    out_dir.mkdir(parents=True, exist_ok=True)

    if not csv_file.exists():
        raise FileNotFoundError(f"Ground truth CSV not found: {csv_file}")

    target_fields = [
        "invoice_number",
        "invoice_date",
        "vendor_name",
        "po_number",
        "base_amount",
        "tax_amount",
        "amount",
        "gstin",
    ]

    total_records = 0
    annotated_records = 0
    unannotated_records = 0
    field_stats = {f: {"total": 0, "exact_match": 0, "normalized_match": 0, "missing": 0} for f in target_fields}
    mismatches = []
    record_summaries = []

    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_records += 1
            inv_id = row.get("invoice_id", f"ROW-{total_records}")
            file_rel_path = row.get("file_path", "")
            file_path = ROOT_DIR / file_rel_path if file_rel_path else None

            # Check if annotated
            has_annotations = any(bool(row.get(f, "").strip()) for f in target_fields)
            if not has_annotations:
                unannotated_records += 1
                record_summaries.append({
                    "invoice_id": inv_id,
                    "file_path": file_rel_path,
                    "status": "BLOCKED",
                    "reason": "Pending ground truth annotation"
                })
                continue

            annotated_records += 1

            # Extract document text and run heuristics
            raw_text = ""
            extracted = {}
            if file_path and file_path.exists():
                if file_path.suffix.lower() == ".txt":
                    with open(file_path, "r", encoding="utf-8") as tf:
                        raw_text = tf.read()
                else:
                    raw_text = extract_raw_text(file_path)
                extracted = parse_invoice_heuristics(raw_text)

            rec_status = "PASS"
            rec_mismatches = []

            for field in target_fields:
                gt_val = row.get(field, "").strip()
                if not gt_val:
                    continue  # Field not annotated for this record

                field_stats[field]["total"] += 1
                pred_val = extracted.get(field)

                # Check missing
                if pred_val is None or str(pred_val).strip() == "" or (isinstance(pred_val, (int, float)) and pred_val == 0.0):
                    field_stats[field]["missing"] += 1
                    rec_mismatches.append({"field": field, "ground_truth": gt_val, "extracted": pred_val, "type": "MISSING"})
                    rec_status = "FAIL"
                    continue

                # Raw and Normalized Match
                is_raw = str(gt_val).strip() == str(pred_val).strip()
                if is_raw:
                    field_stats[field]["exact_match"] += 1

                # Numeric or text comparison
                is_norm = False
                if field in ("amount", "base_amount", "tax_amount"):
                    try:
                        gt_num = float(re.sub(r"[^\d\.]", "", gt_val))
                        pred_num = float(pred_val)
                        if abs(gt_num - pred_num) <= 0.01:
                            is_norm = True
                    except Exception:
                        is_norm = (normalize_val(gt_val) == normalize_val(pred_val))
                else:
                    is_norm = (normalize_val(gt_val) == normalize_val(pred_val))

                if is_norm:
                    field_stats[field]["normalized_match"] += 1
                else:
                    rec_mismatches.append({"field": field, "ground_truth": gt_val, "extracted": pred_val, "type": "MISMATCH"})
                    rec_status = "FAIL"

            if rec_mismatches:
                mismatches.extend([{**m, "invoice_id": inv_id} for m in rec_mismatches])

            record_summaries.append({
                "invoice_id": inv_id,
                "file_path": file_rel_path,
                "status": rec_status,
                "mismatches": rec_mismatches,
            })

    # Aggregate metric calculations
    total_annotated_fields = sum(field_stats[f]["total"] for f in target_fields)
    total_exact_matches = sum(field_stats[f]["exact_match"] for f in target_fields)
    total_norm_matches = sum(field_stats[f]["normalized_match"] for f in target_fields)
    total_missing = sum(field_stats[f]["missing"] for f in target_fields)

    overall_accuracy = (total_norm_matches / total_annotated_fields * 100.0) if total_annotated_fields > 0 else 0.0

    report = {
        "timestamp": os.environ.get("PYTEST_CURRENT_TEST") or "manual_run",
        "total_records": total_records,
        "annotated_records": annotated_records,
        "unannotated_records": unannotated_records,
        "overall_normalized_accuracy_pct": round(overall_accuracy, 2),
        "total_annotated_fields": total_annotated_fields,
        "total_normalized_matches": total_norm_matches,
        "total_exact_matches": total_exact_matches,
        "total_missing_fields": total_missing,
        "field_statistics": field_stats,
        "mismatches": mismatches,
        "records": record_summaries,
    }

    # Save JSON report
    json_path = out_dir / "accuracy_report.json"
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(report, jf, indent=2)

    # Save Markdown report
    md_path = out_dir / "accuracy_report.md"
    with open(md_path, "w", encoding="utf-8") as mf:
        mf.write("# OCR & AI Extraction Accuracy Report\n\n")
        mf.write(f"- **Total Records in Template**: {total_records}\n")
        mf.write(f"- **Annotated Ground-Truth Records**: {annotated_records}\n")
        mf.write(f"- **Unannotated Records (Status BLOCKED)**: {unannotated_records}\n")
        mf.write(f"- **Overall Normalized Field Accuracy**: {round(overall_accuracy, 2)}%\n\n")

        mf.write("## Field-Level Accuracy Statistics\n\n")
        mf.write("| Field Name | Annotated Count | Exact Match | Normalized Match | Missing | Accuracy (%) |\n")
        mf.write("|---|---|---|---|---|---|\n")
        for f in target_fields:
            st = field_stats[f]
            acc = round(st["normalized_match"] / st["total"] * 100.0, 1) if st["total"] > 0 else 0.0
            mf.write(f"| `{f}` | {st['total']} | {st['exact_match']} | {st['normalized_match']} | {st['missing']} | {acc}% |\n")

        mf.write("\n## Record-Level Execution Outcomes\n\n")
        mf.write("| Invoice ID | File Path | Status | Notes |\n")
        mf.write("|---|---|---|---|\n")
        for r in record_summaries:
            mism_count = len(r.get('mismatches', []))
            note = r.get('reason') or f"{mism_count} mismatches"
            mf.write(f"| `{r['invoice_id']}` | `{r.get('file_path')}` | **{r['status']}** | {note} |\n")

        if mismatches:
            mf.write("\n## Detected Mismatches\n\n")
            for m in mismatches:
                mf.write(f"- `{m['invoice_id']}` / `{m['field']}`: Ground Truth=`{m['ground_truth']}`, Extracted=`{m['extracted']}` ({m['type']})\n")

    return report


if __name__ == "__main__":
    rep = evaluate_accuracy()
    print("=" * 60)
    print("DocuFlow Accuracy Evaluation Completed")
    print(f"Total: {rep['total_records']}, Annotated: {rep['annotated_records']}, Blocked: {rep['unannotated_records']}")
    print(f"Overall Accuracy: {rep['overall_normalized_accuracy_pct']}%")
    print("=" * 60)
