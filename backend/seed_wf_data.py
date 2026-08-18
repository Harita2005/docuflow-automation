"""
seed_wf_data.py
One-time import: reads SD Checklists.xlsx and populates the normalized
wf_* tables (wf_workflow, wf_rule, wf_rule_condition, wf_rule_condition_value,
wf_checklist_template, wf_checklist_stage, wf_checklist_item).

Run from backend/ directory:
    python seed_wf_data.py
"""
import re
import json
from pathlib import Path
import openpyxl
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models_wf import (
    WfWorkflow, WfRule, WfRuleCondition, WfRuleConditionValue,
    WfChecklistTemplate, WfChecklistStage, WfChecklistItem,
)

BASE_DIR  = Path(__file__).resolve().parent
EXCEL_PATH = BASE_DIR.parent / "SD Checklists.xlsx"


def normalize(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).strip()).upper()


def clean(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).replace("\xa0", " ").strip())


def read_sheet(wb, name):
    ws = wb[name]
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Stage ordering helper
# ---------------------------------------------------------------------------
STAGE_ORDER = {
    "attachment status": 1,
    "first approval":    2,
    "second approval":   3,
    "3rd approval":      4,
    "ia approval":       5,
    "final approval":    6,
}

def stage_order(name: str) -> int:
    return STAGE_ORDER.get(name.strip().lower(), 99)


# ---------------------------------------------------------------------------
# Parse "Workflow-Based DefaultChecklist" sheet
# Returns: { workflow_name: { stage_name: [item, ...] } }
# ---------------------------------------------------------------------------
def parse_checklist_sheet(rows):
    # headers: WorkFlowName | Status | CheckList
    result = {}
    for row in rows[1:]:
        if not any(v for v in row):
            continue
        wf_name    = clean(row[0])
        stage_name = clean(row[1])
        items_raw  = clean(row[2])
        if not wf_name or not stage_name or not items_raw:
            continue

        # Split comma-separated items, but preserve items with parentheses
        items = []
        buf = ""
        for part in items_raw.split(","):
            part = part.strip()
            if not part:
                continue
            buf = (buf + ", " + part).strip(", ") if buf else part
            if buf.count("(") == buf.count(")"):
                items.append(buf.strip())
                buf = ""
        if buf:
            items.append(buf.strip())

        if wf_name not in result:
            result[wf_name] = {}
        if stage_name not in result[wf_name]:
            result[wf_name][stage_name] = []
        result[wf_name][stage_name].extend(items)

    return result


# ---------------------------------------------------------------------------
# Parse "Checklist configured Category" and "VCC ChecklistConfiguredCategory"
# Returns: list of { company, category, costcenter, branch, paymode,
#                    workflow_name (derived from CategoryName), stages }
# ---------------------------------------------------------------------------
def parse_category_sheet(rows):
    """
    Columns: Checklists | Status | SubStatus | CategoryName | COMPANY |
             CATEGORY | COSTCENTER | BRANCH | PAYMODE | <stage cols...>
    """
    if not rows:
        return []
    headers = rows[0]
    # Find stage columns (index >= 9)
    stage_cols = []
    for i, h in enumerate(headers):
        if i >= 9 and h:
            stage_cols.append((i, clean(h)))

    records = []
    for row in rows[1:]:
        if not any(v for v in row):
            continue
        company      = clean(row[4]) if len(row) > 4 else ""
        category     = clean(row[5]) if len(row) > 5 else ""
        costcenter   = clean(row[6]) if len(row) > 6 else ""
        branch       = clean(row[7]) if len(row) > 7 else ""
        paymode      = clean(row[8]) if len(row) > 8 else ""
        cat_name     = clean(row[3]) if len(row) > 3 else ""

        if not company or not cat_name:
            continue

        records.append({
            "company":    company,
            "category":   category,
            "costcenter": costcenter,
            "branch":     branch,
            "paymode":    paymode,
            "cat_name":   cat_name,
        })
    return records


# ---------------------------------------------------------------------------
# Build workflow→rule mapping from category sheets
# ---------------------------------------------------------------------------
def build_rules_from_categories(cat_records):
    """
    Groups by cat_name (= workflow identifier).
    Returns: { cat_name: { company, categories: set, costcenters: set, branches: set } }
    """
    groups = {}
    for r in cat_records:
        key = r["cat_name"]
        if key not in groups:
            groups[key] = {
                "company":     r["company"],
                "categories":  set(),
                "costcenters": set(),
                "branches":    set(),
            }
        if r["category"] and r["category"].upper() != "ALL":
            groups[key]["categories"].add(r["category"])
        if r["costcenter"] and r["costcenter"].upper() != "ALL":
            groups[key]["costcenters"].add(r["costcenter"])
        if r["branch"] and r["branch"].upper() != "ALL":
            groups[key]["branches"].add(r["branch"])
    return groups


# ---------------------------------------------------------------------------
# Main seed function
# ---------------------------------------------------------------------------
def seed():
    if not EXCEL_PATH.exists():
        print(f"[ERROR] Excel not found: {EXCEL_PATH}")
        return

    print(f"[seed_wf_data] Reading: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(str(EXCEL_PATH))

    # Read sheets
    checklist_rows  = read_sheet(wb, "Workflow-Based DefaultChecklist")
    cat_rows_sd     = read_sheet(wb, "Checklist configured Category")
    cat_rows_vcc    = read_sheet(wb, "VCC ChecklistConfiguredCategory")

    checklist_data  = parse_checklist_sheet(checklist_rows)
    cat_records_sd  = parse_category_sheet(cat_rows_sd)
    cat_records_vcc = parse_category_sheet(cat_rows_vcc)
    all_cat_records = cat_records_sd + cat_records_vcc
    rule_groups     = build_rules_from_categories(all_cat_records)

    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # Clear existing wf_ data (idempotent re-run) - order matters for FK constraints
        from app.models_wf import WfMatchLog, WfExecutionChecklist, WfExecution, WfExecutionInput
        for model in [WfMatchLog, WfExecutionChecklist, WfExecution, WfExecutionInput,
                      WfChecklistItem, WfChecklistStage, WfChecklistTemplate,
                      WfRuleConditionValue, WfRuleCondition, WfRule, WfWorkflow]:
            db.query(model).delete()
        db.commit()
        print("[seed_wf_data] Cleared existing wf_* data.")

        # ----------------------------------------------------------------
        # 1. Create WfWorkflow rows from checklist_data keys
        # ----------------------------------------------------------------
        wf_map = {}  # workflow_name -> WfWorkflow
        priority = 10

        for wf_name in checklist_data.keys():
            wf_code = re.sub(r"[^A-Z0-9_]", "_", wf_name.upper())[:100]
            wf = WfWorkflow(
                workflow_code=wf_code,
                workflow_name=wf_name,
                workflow_type="AP_INVOICE",
                description=f"Imported from SD Checklists.xlsx",
                is_active=True,
            )
            db.add(wf)
            db.flush()
            wf_map[wf_name] = wf
            priority += 2

        # Also create workflows for cat_names not in checklist_data
        # Try to find a matching checklist workflow by prefix/similarity
        for cat_name in rule_groups.keys():
            if cat_name not in wf_map:
                # Try to find a matching workflow in checklist_data
                matched_wf = None
                cat_upper = cat_name.upper()
                for cl_wf_name in checklist_data.keys():
                    if cat_upper in cl_wf_name.upper() or cl_wf_name.upper().startswith(cat_upper):
                        matched_wf = wf_map.get(cl_wf_name)
                        break
                if matched_wf:
                    # Alias: point this cat_name to the existing workflow
                    wf_map[cat_name] = matched_wf
                else:
                    wf_code = re.sub(r"[^A-Z0-9_]", "_", cat_name.upper())[:100]
                    wf = WfWorkflow(
                        workflow_code=wf_code,
                        workflow_name=cat_name,
                        workflow_type="AP_INVOICE",
                        is_active=True,
                    )
                    db.add(wf)
                    db.flush()
                    wf_map[cat_name] = wf

        db.commit()
        print(f"[seed_wf_data] Created {len(wf_map)} workflows.")

        # ----------------------------------------------------------------
        # 2. Create WfRule + conditions from rule_groups
        # ----------------------------------------------------------------
        rule_priority = 10
        rules_created = 0

        for cat_name, gdata in rule_groups.items():
            wf = wf_map.get(cat_name)
            if not wf:
                continue

            company = gdata["company"]
            rule = WfRule(
                workflow_id=wf.workflow_id,
                rule_name=f"Rule: {cat_name}",
                rule_code=cat_name,
                condition_type="AND",
                priority=rule_priority,
                description=f"Auto-imported from Excel for {company}",
                is_active=True,
            )
            db.add(rule)
            db.flush()
            rule_priority += 2
            rules_created += 1

            cond_order = 1

            # Division condition
            div_cond = WfRuleCondition(
                rule_id=rule.rule_id,
                field_name="Division",
                operator="equals",
                logical_operator="AND",
                condition_order=cond_order,
            )
            db.add(div_cond)
            db.flush()
            cond_order += 1
            db.add(WfRuleConditionValue(
                condition_id=div_cond.condition_id,
                value=company,
                normalized_value=normalize(company),
                sequence=1,
            ))

            # Category condition
            if gdata["categories"]:
                cat_cond = WfRuleCondition(
                    rule_id=rule.rule_id,
                    field_name="Category",
                    operator="contains any of",
                    logical_operator="AND",
                    condition_order=cond_order,
                )
                db.add(cat_cond)
                db.flush()
                cond_order += 1
                for seq, cv in enumerate(sorted(gdata["categories"]), 1):
                    db.add(WfRuleConditionValue(
                        condition_id=cat_cond.condition_id,
                        value=cv,
                        normalized_value=normalize(cv),
                        sequence=seq,
                    ))

            # Cost Center condition
            if gdata["costcenters"]:
                cc_cond = WfRuleCondition(
                    rule_id=rule.rule_id,
                    field_name="Cost Center",
                    operator="contains any of",
                    logical_operator="AND",
                    condition_order=cond_order,
                )
                db.add(cc_cond)
                db.flush()
                cond_order += 1
                for seq, cv in enumerate(sorted(gdata["costcenters"]), 1):
                    db.add(WfRuleConditionValue(
                        condition_id=cc_cond.condition_id,
                        value=cv,
                        normalized_value=normalize(cv),
                        sequence=seq,
                    ))

            # Branch/Plant condition
            if gdata["branches"]:
                br_cond = WfRuleCondition(
                    rule_id=rule.rule_id,
                    field_name="Plant",
                    operator="contains any of",
                    logical_operator="AND",
                    condition_order=cond_order,
                )
                db.add(br_cond)
                db.flush()
                for seq, cv in enumerate(sorted(gdata["branches"]), 1):
                    db.add(WfRuleConditionValue(
                        condition_id=br_cond.condition_id,
                        value=cv,
                        normalized_value=normalize(cv),
                        sequence=seq,
                    ))

        db.commit()
        print(f"[seed_wf_data] Created {rules_created} rules with normalized conditions.")

        # ----------------------------------------------------------------
        # 3. Create checklist templates, stages, items
        # ----------------------------------------------------------------
        items_created = 0

        for wf_name, stages_data in checklist_data.items():
            wf = wf_map.get(wf_name)
            if not wf:
                continue

            template = WfChecklistTemplate(
                workflow_id=wf.workflow_id,
                template_name=f"{wf_name} Checklist",
                is_active=True,
            )
            db.add(template)
            db.flush()

            for stage_name, items in stages_data.items():
                stage = WfChecklistStage(
                    checklist_template_id=template.checklist_template_id,
                    stage_name=stage_name,
                    stage_order=stage_order(stage_name),
                    is_active=True,
                )
                db.add(stage)
                db.flush()

                seen = set()
                order = 1
                for item_text in items:
                    cleaned = clean(item_text).strip(", ")
                    if not cleaned or cleaned in seen:
                        continue
                    seen.add(cleaned)
                    db.add(WfChecklistItem(
                        stage_id=stage.stage_id,
                        item_name=cleaned,
                        item_type="CHECKBOX",
                        item_order=order,
                        is_required=True,
                        is_active=True,
                    ))
                    order += 1
                    items_created += 1

        db.commit()
        print(f"[seed_wf_data] Created checklist templates with {items_created} items.")
        print("[seed_wf_data] Done.")

    except Exception as e:
        db.rollback()
        print(f"[seed_wf_data] ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
