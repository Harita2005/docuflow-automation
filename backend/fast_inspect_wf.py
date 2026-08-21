import zipfile
import xml.etree.cElementTree as ET
from pathlib import Path

EXCEL_PATH = Path("SD SCHEMA AND WORKFLOW DETAILS.xlsx")

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

    print("Sheets in workbook:", list(sheets.keys()))

    for sname in sheets:
        tree = ET.fromstring(z.read(sheets[sname]))
        rows = tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
        print(f"\n==================== Sheet: {sname} ({len(rows)} rows) ====================")
        for r_idx in range(min(5, len(rows))):
            r = rows[r_idx]
            row_dict = {}
            for c in r.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                r_ref = c.attrib.get('r')
                col = ''.join([ch for ch in r_ref if ch.isalpha()])
                t = c.attrib.get('t')
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                if v is not None and v.text:
                    val = shared_strings[int(v.text)] if t == 's' else v.text
                else:
                    val = ''
                row_dict[col] = val
            print(f"Row {r_idx+1}:", row_dict)
