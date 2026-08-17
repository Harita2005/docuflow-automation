import sys
import os
import json
import datetime
import zipfile
import xml.etree.ElementTree as ET
import pyodbc
from pathlib import Path
from collections import defaultdict

# Setup paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
EXCEL_PATH = PROJECT_ROOT / "SD Checklists.xlsx"
DATA_PATH = PROJECT_ROOT / "backend" / "production_data.json"

def read_excel_sheet(filepath, sheet_name_target):
    with zipfile.ZipFile(filepath, 'r') as z:
        # Load shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t_elems = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                shared_strings.append(''.join([t.text for t in t_elems if t.text]))

        # Find target sheet file from workbook.xml
        workbook_tree = ET.fromstring(z.read('xl/workbook.xml'))
        sheet_file = None
        for sheet in workbook_tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = sheet.attrib.get('name')
            if name == sheet_name_target:
                r_id = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                rels_tree = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
                for rel in rels_tree.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                    if rel.attrib.get('Id') == r_id:
                        sheet_file = 'xl/' + rel.attrib.get('Target')
                        break
                break

        if not sheet_file:
            raise FileNotFoundError(f"Sheet '{sheet_name_target}' not found in workbook.")

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

def parse_checklist_items(items_str):
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
    
    final_items = []
    for item_text in cleaned_items:
        clean_text = item_text.strip().replace("\u00a0", " ").strip(", ")
        if clean_text:
            final_items.append(clean_text)
    return final_items

def get_wf_checklist_name(profile_name, total_stages):
    p = (profile_name or "").upper()
    if "GRN" in p: 
        return "ACM_GRN_Header_2stages"
    if "ENES" in p: 
        return "ENES_ASSET_STAGE _6"
    if "VCC_PURCHASE" in p or "FIXED_ASSET" in p:
        if total_stages == 2: return "VCC_DA_IA_FLOW"
        elif total_stages == 3: return "VCC_DocAppFlow_DA_IA_FA_3_W-C"
        elif total_stages == 5: return "VCC_DocApprovalFlow_All5_W-A"
        elif total_stages == 4: return "VCC_DocApprovalFlow_DA_FA_IA_FIA_W-B"
        else: return "VCC_DocAppFlow_DA_IA_FA_3_W-C"
    if "EVOUCHER_INV" in p: 
        return "VCC_DocAppFlow_DA_IA_FA_3_W-C"
    return "All_General_Temp"

def main():
    conn_str = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=DocuFlowDB;Trusted_Connection=yes;TrustServerCertificate=yes"
    
    # 1. Load production_data.json
    if not DATA_PATH.exists():
        print(f"[ERROR] production_data.json not found at {DATA_PATH}")
        return
        
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    conn = pyodbc.connect(conn_str, autocommit=True)
    cursor = conn.cursor()

    print("==================================================================")
    print(">>> SEEDING ENTERPRISE WORKFLOWS, STAGES & CHECKLISTS")
    print("==================================================================")

    # 2. Seed Workflow Definitions, Versions, and Stages
    profiles = data.get("workflow_profiles", [])
    step_defs = data.get("workflow_step_definitions", [])

    # Count total stages for each workflow profile
    wf_stages_count = defaultdict(int)
    for s in step_defs:
        wf_stages_count[s.get("profile_name")] += 1

    print(f"Syncing {len(profiles)} Workflow Profiles into DocuFlowDB...")
    for p in profiles:
        wf_name = p.get("profile_name")
        wf_code = p.get("workflow_code") or wf_name
        
        # Insert Workflow Definition if not exists
        cursor.execute("SELECT 1 FROM workflow.workflow_definitions WHERE definition_code = ?", wf_code)
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO workflow.workflow_definitions (definition_code, definition_name, is_active, created_at)
                VALUES (?, ?, 1, SYSUTCDATETIME())
            """, wf_code, wf_name)
        
        # Get Definition ID
        cursor.execute("SELECT workflow_definition_id FROM workflow.workflow_definitions WHERE definition_code = ?", wf_code)
        def_id = cursor.fetchone()[0]

        # Insert Version 1 if not exists
        cursor.execute("SELECT 1 FROM workflow.workflow_versions WHERE workflow_definition_id = ? AND version_number = 1", def_id)
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO workflow.workflow_versions (workflow_definition_id, version_number, is_published, effective_from, created_at)
                VALUES (?, 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME())
            """, def_id)

    # Get workflow version mapping using definition_name (profile_name)
    cursor.execute("""
        SELECT d.definition_name, v.workflow_version_id 
        FROM workflow.workflow_versions v
        JOIN workflow.workflow_definitions d ON v.workflow_definition_id = d.workflow_definition_id
        WHERE v.version_number = 1
    """)
    wf_version_map = {row[0]: row[1] for row in cursor.fetchall()}

    print(f"Syncing {len(step_defs)} Workflow Stages...")
    stages_synced_count = 0
    for s in step_defs:
        profile_name = s.get("profile_name")
        stage_num = s.get("stage_number")
        step_name = s.get("step_name")
        
        ver_id = wf_version_map.get(profile_name)
        if not ver_id:
            continue
            
        stage_code = f"STAGE_{stage_num}"
        # Determine Stage Type
        stage_type = "OPERATIONAL"
        if stage_num == 1:
            stage_type = "INITIAL"
            
        # Check if stage exists
        cursor.execute("SELECT 1 FROM workflow.workflow_stages WHERE workflow_version_id = ? AND stage_code = ?", ver_id, stage_code)
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO workflow.workflow_stages (workflow_version_id, stage_code, stage_name, sequence_order, stage_type, created_at)
                VALUES (?, ?, ?, ?, ?, SYSUTCDATETIME())
            """, ver_id, stage_code, step_name, stage_num * 10, stage_type)
            stages_synced_count += 1

    print(f"[OK] Synced stages. Inserted {stages_synced_count} new stage configurations.")

    # 3. Read SD Checklists.xlsx
    print(f"Reading Checklist templates from {EXCEL_PATH}...")
    if not EXCEL_PATH.exists():
        print(f"[ERROR] Checklist spreadsheet not found at {EXCEL_PATH}")
        cursor.close()
        conn.close()
        return

    try:
        rows = read_excel_sheet(str(EXCEL_PATH), "Workflow-Based DefaultChecklist")
        headers = rows[0]
        col_wf = None
        col_status = None
        col_checklist = None
        
        for k, v in headers.items():
            val = v.strip().lower()
            if "workflow" in val:
                col_wf = k
            elif "status" in val:
                col_status = k
            elif "checklist" in val:
                col_checklist = k

        # Parse and group checklist templates by WorkFlowName and Status
        excel_checklists = defaultdict(list)
        for r in rows[1:]:
            wf_name = r.get(col_wf, '').strip()
            stage_name = r.get(col_status, '').strip()
            items_str = r.get(col_checklist, '').strip()
            
            if not wf_name or not stage_name or not items_str:
                continue

            cleaned_items = parse_checklist_items(items_str)
            excel_checklists[(wf_name, stage_name)].extend(cleaned_items)

        print(f"Found {len(excel_checklists)} checklist template groups in Excel.")

        # Query all active stages in DocuFlowDB to map checklist items to them
        cursor.execute("""
            SELECT s.workflow_stage_id, d.definition_name, s.stage_name 
            FROM workflow.workflow_stages s
            JOIN workflow.workflow_versions v ON s.workflow_version_id = v.workflow_version_id
            JOIN workflow.workflow_definitions d ON v.workflow_definition_id = d.workflow_definition_id
        """)
        db_stages = cursor.fetchall()
        
        templates_added = 0
        for stage_id, profile_name, stage_name in db_stages:
            # Determine mapping workflow profile
            total_stages = wf_stages_count.get(profile_name, 2)
            target_checklist_wf = get_wf_checklist_name(profile_name, total_stages)
            
            # Retrieve checklist items matching target_checklist_wf and stage_name
            items = excel_checklists.get((target_checklist_wf, stage_name))
            if not items:
                # Try default fallback template if specific not found
                items = excel_checklists.get(("All_General_Temp", stage_name))
                
            if items:
                for seq, item_text in enumerate(items, start=1):
                    cursor.execute("SELECT 1 FROM workflow.workflow_checklist_templates WHERE workflow_stage_id = ? AND item_text = ?", stage_id, item_text)
                    if not cursor.fetchone():
                        cursor.execute("""
                            INSERT INTO workflow.workflow_checklist_templates (workflow_stage_id, item_text, is_mandatory, sequence_order, created_at)
                            VALUES (?, ?, 1, ?, SYSUTCDATETIME())
                        """, stage_id, item_text, seq)
                        templates_added += 1

        print(f"[OK] Successfully seeded {templates_added} checklist templates mapped to production workflows.")

    except Exception as e:
        print(f"[ERROR] Failed to seed compliance checklists: {e}")

    cursor.close()
    conn.close()
    print("Database seeding completed.")

if __name__ == "__main__":
    main()
