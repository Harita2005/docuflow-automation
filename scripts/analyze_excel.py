import zipfile, xml.etree.ElementTree as ET
from collections import defaultdict
import json

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

    # 1. SD WORKFLOW
    sd_rows = read_sheet('xl/worksheets/sheet2.xml')
    sd_headers = sd_rows[0]
    print('=== SD WORKFLOW ANALYSIS ===')
    print('Headers:', sd_headers)
    
    # Collect unique companies, categories, workflows
    sd_companies = defaultdict(list)
    for r in sd_rows[1:]:
        if len(r) < 2: continue
        comp = r[1].strip()
        if comp:
            sd_companies[comp].append(r)
            
    print('SD Companies found:', list(sd_companies.keys()))
    for comp, rows in sd_companies.items():
        print(f'\n--- Company: {comp} ({len(rows)} rows) ---')
        # Group by workflow / approvers
        wf_groups = defaultdict(lambda: {'categories': set(), 'costcenters': set(), 'branches': set(), 'paymodes': set(), 'stages': {}})
        for r in rows:
            wf_name = r[0].strip() if len(r) > 0 else ''
            cat = r[2].strip() if len(r) > 2 else ''
            cc = r[3].strip() if len(r) > 3 else ''
            br = r[4].strip() if len(r) > 4 else ''
            pm = r[5].strip() if len(r) > 5 else ''
            
            # Stages
            stages = {}
            for col_idx in range(6, len(r)):
                stage_name = sd_headers[col_idx] if col_idx < len(sd_headers) else f'Stage {col_idx-5}'
                target = r[col_idx].strip()
                if target:
                    stages[stage_name] = target
                    
            key = (wf_name, json.dumps(stages, sort_keys=True))
            if cat and cat != 'ALL': wf_groups[key]['categories'].add(cat)
            if cc and cc != 'ALL': wf_groups[key]['costcenters'].add(cc)
            if br and br != 'ALL': wf_groups[key]['branches'].add(br)
            if pm and pm != 'ALL': wf_groups[key]['paymodes'].add(pm)
            wf_groups[key]['stages'] = stages
            
        print(f'Grouped into {len(wf_groups)} distinct workflow profiles & approver sets for {comp}:')
        for (wf_name, stages_json), data in wf_groups.items():
            print(f'  • Workflow Profile: [{wf_name}]')
            print(f'    - Categories ({len(data["categories"])}): {list(data["categories"])[:5]}...')
            print(f'    - Cost Centers ({len(data["costcenters"])}): {list(data["costcenters"])[:5]}...')
            print(f'    - Branches ({len(data["branches"])}): {list(data["branches"])[:5]}...')
            print(f'    - Stages: {data["stages"]}')

    # 2. VCC WORKFLOW
    vcc_rows = read_sheet('xl/worksheets/sheet3.xml')
    vcc_headers = vcc_rows[0]
    print('\n\n=== VCC WORKFLOW ANALYSIS ===')
    print('Headers:', vcc_headers)
    print(f'Total VCC rows: {len(vcc_rows)-1}')
    
    vcc_groups = defaultdict(lambda: {'categories': set(), 'costcenters': set(), 'branches': set(), 'paymodes': set(), 'stages': {}})
    for r in vcc_rows[1:]:
        if len(r) < 2: continue
        wf_name = r[0].strip() if len(r) > 0 else ''
        comp = r[1].strip() if len(r) > 1 else ''
        cat = r[2].strip() if len(r) > 2 else ''
        cc = r[3].strip() if len(r) > 3 else ''
        br = r[4].strip() if len(r) > 4 else ''
        pm = r[5].strip() if len(r) > 5 else ''
        
        stages = {}
        for col_idx in range(6, len(r)):
            stage_name = vcc_headers[col_idx] if col_idx < len(vcc_headers) else f'Stage {col_idx-5}'
            target = r[col_idx].strip()
            if target:
                stages[stage_name] = target
                
        key = (wf_name, comp, json.dumps(stages, sort_keys=True))
        if cat and cat != 'ALL': vcc_groups[key]['categories'].add(cat)
        if cc and cc != 'ALL': vcc_groups[key]['costcenters'].add(cc)
        if br and br != 'ALL': vcc_groups[key]['branches'].add(br)
        if pm and pm != 'ALL': vcc_groups[key]['paymodes'].add(pm)
        vcc_groups[key]['stages'] = stages

    print(f'VCC grouped into {len(vcc_groups)} distinct workflow profiles & approver sets:')
    for (wf_name, comp, _), data in list(vcc_groups.items())[:20]:
        print(f'  • Workflow: [{wf_name}] Company: [{comp}]')
        print(f'    - Categories ({len(data["categories"])}): {list(data["categories"])[:3]}...')
        print(f'    - Cost Centers ({len(data["costcenters"])}): {list(data["costcenters"])[:3]}...')
        print(f'    - Branches ({len(data["branches"])}): {list(data["branches"])[:3]}...')
        print(f'    - Stages: {data["stages"]}')
