import zipfile, xml.etree.ElementTree as ET

filepath = r'C:\Users\TempAdmin\Downloads\SD SCHEMA AND WORKFLOW DETAILS (1).xlsx'
with zipfile.ZipFile(filepath, 'r') as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
            t_elems = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
            shared_strings.append(''.join([t.text for t in t_elems if t.text]))
            
    def read_sheet(sheet_file):
        sheet_tree = ET.fromstring(z.read(sheet_file))
        rows = []
        for row in sheet_tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
            row_vals = []
            for c in row.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                t_attr = c.attrib.get('t')
                v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                if t_attr == 's' and val.isdigit() and int(val) < len(shared_strings):
                    val = shared_strings[int(val)]
                row_vals.append(val)
            rows.append(row_vals)
        return rows

    rows = read_sheet('xl/worksheets/sheet1.xml')
    print(f"Sheet 1 Row Count: {len(rows)}")
    for i, r in enumerate(rows[:30]):
        print(f"Row {i}: {r}")
