import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import ChecklistTemplate

BASE_DIR = Path(__file__).resolve().parent
EXCEL_PATH = BASE_DIR.parent / "SD Checklists.xlsx"

def read_excel_sheet(filepath, sheet_name_target):
    with zipfile.ZipFile(filepath, 'r') as z:
        # Load shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t_elems = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                shared_strings.append(''.join([t.text for t in t_elems if t.text]))

        # Find target sheet file from workbook.xml.rels or workbook.xml
        workbook_tree = ET.fromstring(z.read('xl/workbook.xml'))
        sheet_file = None
        for sheet in workbook_tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = sheet.attrib.get('name')
            if name == sheet_name_target:
                r_id = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                # Load workbook.xml.rels to resolve rId to file path
                rels_tree = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
                for rel in rels_tree.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                    if rel.attrib.get('Id') == r_id:
                        sheet_file = 'xl/' + rel.attrib.get('Target')
                        break
                break

        if not sheet_file:
            raise FileNotFoundError(f"Sheet '{sheet_name_target}' not found in workbook relations.")

        # Parse sheet rows
        sheet_tree = ET.fromstring(z.read(sheet_file))
        rows = []
        for row in sheet_tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
            row_cells = {}
            for c in row.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                r_ref = c.attrib.get('r')
                col_letter = ''.join([char for char in r_ref if char.isalpha()])
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                if c.attrib.get('t') == 's' and val.isdigit() and int(val) < len(shared_strings):
                    val = shared_strings[int(val)]
                row_cells[col_letter] = val
            rows.append(row_cells)
        return rows

def seed_checklists():
    # Ensure all tables (including new checklist tables) are created
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    print("==================================================================")
    print(">>> SEEDING RELATIONAL CHECKLIST TEMPLATES FROM EXCEL")
    print("==================================================================")

    if not EXCEL_PATH.exists():
        print(f"[ERROR] SD Checklists.xlsx not found at: {EXCEL_PATH}")
        return

    try:
        # 1. Read sheet 'Workflow-Based DefaultChecklist' (typically Sheet 4)
        rows = read_excel_sheet(str(EXCEL_PATH), "Workflow-Based DefaultChecklist")
        if not rows:
            print("[ERROR] No rows parsed from Workflow-Based DefaultChecklist")
            return
            
        # 2. Clear old templates
        db.query(ChecklistTemplate).delete()
        db.commit()

        headers = rows[0]
        col_map = {k: v for k, v in headers.items()}
        
        # Determine columns
        col_wf = None
        col_status = None
        col_checklist = None
        for k, v in col_map.items():
            val = v.strip().lower()
            if "workflow" in val:
                col_wf = k
            elif "status" in val:
                col_status = k
            elif "checklist" in val:
                col_checklist = k

        if not col_wf or not col_status or not col_checklist:
            print(f"[ERROR] Could not map columns. Mapped: WF={col_wf}, Status={col_status}, Checklist={col_checklist}")
            return

        templates_added = 0
        for r_idx, r in enumerate(rows[1:]):
            wf_name = r.get(col_wf, '').strip()
            stage_name = r.get(col_status, '').strip()
            items_str = r.get(col_checklist, '').strip()
            
            if not wf_name or not stage_name or not items_str:
                continue

            raw_items = items_str.split(',')
            cleaned_items = []
            
            temp = ""
            for item in raw_items:
                candidate = item.strip()
                if not candidate:
                    continue
                if "(" in candidate and ")" not in candidate:
                    temp = candidate
                elif temp:
                    temp += ", " + candidate
                    if ")" in candidate:
                        cleaned_items.append(temp)
                        temp = ""
                else:
                    cleaned_items.append(candidate)

            for seq, item_text in enumerate(cleaned_items, start=1):
                clean_text = item_text.strip().replace("\u00a0", " ")
                clean_text = clean_text.strip(", ")
                if not clean_text:
                    continue
                
                template_row = ChecklistTemplate(
                    workflow_profile=wf_name,
                    stage_name=stage_name,
                    item_text=clean_text,
                    is_mandatory=True,
                    is_active=True,
                    sequence_order=seq
                )
                db.add(template_row)
                templates_added += 1

        db.commit()
        print(f"[OK] Successfully seeded {templates_added} checklist template items.")
        print(f"Total template rows in table: {db.query(ChecklistTemplate).count()}")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Seeding failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_checklists()
