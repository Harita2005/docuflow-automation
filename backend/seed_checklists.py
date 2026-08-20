import os
import sys
import json
import zipfile
import xml.etree.cElementTree as ET
from pathlib import Path
from collections import defaultdict
from sqlalchemy.orm import Session

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal, engine, Base
from app.models import ChecklistRule, ChecklistTemplate

candidate_paths = [
    BASE_DIR / "SD Checklists.xlsx",
    BASE_DIR.parent / "SD Checklists.xlsx",
    Path("/app/SD Checklists.xlsx"),
    Path.cwd() / "SD Checklists.xlsx"
]
EXCEL_PATH = next((p for p in candidate_paths if p.exists()), candidate_paths[0])

def seed_checklists_from_excel():
    print("==================================================================")
    print(">>> SEEDING DEDICATED CHECKLIST CONDITION MATRIX")
    print(f">>> Source: {EXCEL_PATH}")
    print("==================================================================")

    if not EXCEL_PATH.exists():
        print(f"[ERROR] Checklist Excel file not found: {EXCEL_PATH}")
        return

    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        with zipfile.ZipFile(str(EXCEL_PATH), 'r') as z:
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t_elems = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    shared_strings.append(''.join([t.text for t in t_elems if t.text]))

            wb_tree = ET.fromstring(z.read('xl/workbook.xml'))
            rels_tree = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            rel_map = {rel.attrib.get('Id'): rel.attrib.get('Target') for rel in rels_tree.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')}
            sheets = {sheet.attrib.get('name'): 'xl/' + rel_map[sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')] for sheet in wb_tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet')}

            def get_sheet_rows(sheet_name):
                if sheet_name not in sheets: return []
                tree = ET.fromstring(z.read(sheets[sheet_name]))
                rows = tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                all_data = []
                for r in rows:
                    cells = r.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c')
                    vals = {}
                    for c in cells:
                        r_ref = c.attrib.get('r')
                        col = ''.join([ch for ch in r_ref if ch.isalpha()])
                        t = c.attrib.get('t')
                        v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        if v is not None and v.text:
                            val = shared_strings[int(v.text)] if t == 's' else v.text
                        else:
                            val = ''
                        vals[col] = val
                    all_data.append(vals)
                return all_data

            # Grouped rules: (comp, cat, branch, stage, wf_name) -> list of items
            grouped_rules = defaultdict(lambda: {
                'items': [],
                'is_mandatory': True
            })

            def add_items_to_group(key, raw_text):
                if not raw_text: return
                for it in raw_text.split(','):
                    clean_it = it.strip()
                    if clean_it and clean_it not in grouped_rules[key]['items']:
                        grouped_rules[key]['items'].append(clean_it)

            # Sheet 2: Checklist configured Category
            cat_rows = get_sheet_rows('Checklist configured Category')
            for r in cat_rows[1:]:
                chk_text = r.get('A', '').strip()
                stage = r.get('B', '').strip() or 'Attachment Status'
                wf_name = r.get('D', '').strip()
                comp = r.get('E', '').strip() or 'ALL'
                cat = r.get('F', '').strip() or 'ALL'
                branch = r.get('H', '').strip() or 'ALL'
                key = (comp, cat, branch, stage, wf_name)
                add_items_to_group(key, chk_text)

            # Sheet 3: VCC ChecklistConfiguredCategory
            vcc_rows = get_sheet_rows('VCC ChecklistConfiguredCategory')
            for r in vcc_rows[1:]:
                chk_text = r.get('A', '').strip()
                stage = r.get('B', '').strip() or 'Attachment Status'
                wf_name = r.get('D', '').strip()
                comp = r.get('E', '').strip() or 'VCC'
                cat = r.get('F', '').strip() or 'ALL'
                branch = r.get('H', '').strip() or 'ALL'
                key = (comp, cat, branch, stage, wf_name)
                add_items_to_group(key, chk_text)

            # Sheet 4: Workflow-Based DefaultChecklist
            wf_rows = get_sheet_rows('Workflow-Based DefaultChecklist')
            for r in wf_rows[1:]:
                wf_name = r.get('A', '').strip()
                stage = r.get('B', '').strip() or 'Attachment Status'
                chk_text = r.get('C', '').strip()
                if chk_text and wf_name:
                    key = ('ALL', 'ALL', 'ALL', stage, wf_name)
                    add_items_to_group(key, chk_text)

        # Clear existing ChecklistRule and seed fresh
        db.query(ChecklistRule).delete()
        db.commit()

        rule_count = 0
        item_count = 0
        for (comp, cat, branch, stage, wf_name), data in grouped_rules.items():
            if not data['items']: continue
            rule_count += 1
            rule_name = f"CHK_{comp}_{cat[:20]}_{stage[:15]}".replace(" ", "_").replace("&", "_").replace("/", "_").strip("_")
            rule_name = f"{rule_name}_{rule_count}"
            
            items_str = ", ".join(data['items'])
            new_r = ChecklistRule(
                rule_name=rule_name,
                division=comp,
                category=cat,
                branch=branch,
                workflow_profile=wf_name,
                stage_name=stage,
                item_text=items_str,
                is_mandatory=True,
                is_active=True,
                sequence_order=rule_count
            )
            db.add(new_r)
            item_count += len(data['items'])

        db.commit()
        print(f"[OK] Successfully seeded {rule_count} distinct Checklist Condition Rules with {item_count} verification checkpoints!")
        print(f"Total Checklist Rules in database: {db.query(ChecklistRule).count()}")

    except Exception as e:
        print(f"[ERROR] Failed to seed checklists: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_checklists_from_excel()
