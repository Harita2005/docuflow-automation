import os
import zipfile
import json
import uuid
import random
import datetime
import xml.etree.ElementTree as ET
from collections import defaultdict
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import User, WorkflowProfile, WorkflowStepDefinition, BusinessRule, Invoice, AuditLog
from app.auth import get_password_hash

EXCEL_PATH = r'C:\Users\TempAdmin\Downloads\SD SCHEMA AND WORKFLOW DETAILS (1).xlsx'

def read_excel_workbook(filepath):
    with zipfile.ZipFile(filepath, 'r') as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                t_elems = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                shared_strings.append(''.join([t.text for t in t_elems if t.text]))
                
        def parse_sheet_iter(sheet_file):
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

        sheet2 = parse_sheet_iter('xl/worksheets/sheet2.xml') if 'xl/worksheets/sheet2.xml' in z.namelist() else []
        sheet3 = parse_sheet_iter('xl/worksheets/sheet3.xml') if 'xl/worksheets/sheet3.xml' in z.namelist() else []
        return sheet2, sheet3

def seed_all_31_flows_and_conditions():
    # Drop and recreate for pristine clean state
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    print("==================================================================")
    print(">>> PARSING EXCEL MATRIX & GENERATING ALL 31 COMBINED CONDITIONS")
    print("==================================================================")

    default_pw_hash = get_password_hash("password123")

    # 1. READ EXCEL SHEETS
    print("Reading Excel sheets...")
    sd_rows, vcc_rows = read_excel_workbook(EXCEL_PATH)
    print(f"Loaded {len(sd_rows)} SD rows and {len(vcc_rows)} VCC rows.")

    sd_headers = sd_rows[0] if sd_rows else []
    vcc_headers = vcc_rows[0] if vcc_rows else []

    all_approvers = set()

    # 2. GROUP SD WORKFLOWS (Sheet 2) - Group by Main SD Companies (ACC, ENES, EIC, RCH, RMPL, RRTC)
    SD_MAIN_COMPANIES = ["ACC", "ENES", "EIC", "RCH", "RMPL", "RRTC"]
    sd_groups = {comp: {'categories': set(), 'costcenters': set(), 'branches': set(), 'stages': []} for comp in SD_MAIN_COMPANIES}

    for r in sd_rows[1:]:
        if len(r) < 2: continue
        comp_raw = r[1].strip()
        matched_comp = None
        for c in SD_MAIN_COMPANIES:
            if comp_raw.startswith(c):
                matched_comp = c
                break
        if not matched_comp:
            matched_comp = "ACC"

        cat = r[2].strip() if len(r) > 2 else ''
        cc = r[3].strip() if len(r) > 3 else ''
        br = r[4].strip() if len(r) > 4 else ''
        
        stages = []
        for col_idx in range(6, len(r)):
            if col_idx < len(sd_headers):
                stage_name = sd_headers[col_idx].strip()
                approver = r[col_idx].strip()
                if approver and approver != '-':
                    stages.append((stage_name, approver))
                    for u in approver.split(','):
                        if u.strip() and u.strip() not in ['ALL', '-']:
                            all_approvers.add(u.strip())
        
        if cat and cat != 'ALL': sd_groups[matched_comp]['categories'].add(cat)
        if cc and cc != 'ALL': sd_groups[matched_comp]['costcenters'].add(cc)
        if br and br != 'ALL': sd_groups[matched_comp]['branches'].add(br)
        if not sd_groups[matched_comp]['stages'] and stages:
            sd_groups[matched_comp]['stages'] = stages

    # Default SD stages if none captured
    default_sd_stages = [
        ("ATTACHMENT STATUS", "NATHIYA_16220,RAMANASUNDAR_E22-02094,REVATHI_E21-01819,RISHIKESAVAN_E25-00790"),
        ("FIRST APPROVAL", "KANNADHASAN_8349"),
        ("IA APPROVAL", "ABINAYA_E25-06919,DINESH_E21-02621"),
        ("FINAL APPROVAL", "PGMOHAN1176,RAJAVEL18285")
    ]
    for comp in SD_MAIN_COMPANIES:
        if not sd_groups[comp]['stages']:
            sd_groups[comp]['stages'] = default_sd_stages
            for _, apprs in default_sd_stages:
                for u in apprs.split(','):
                    all_approvers.add(u.strip())

    # 3. GROUP VCC WORKFLOWS (Sheet 3) - Group into the 25 Master Combined Profiles
    vcc_groups = defaultdict(lambda: {'categories': set(), 'costcenters': set(), 'branches': set(), 'stages': []})

    for r in vcc_rows[1:]:
        if len(r) < 2: continue
        wf_name = r[0].strip()
        if not wf_name: continue
        
        cat = r[2].strip() if len(r) > 2 else ''
        cc = r[3].strip() if len(r) > 3 else ''
        br = r[4].strip() if len(r) > 4 else ''
        
        stages = []
        for col_idx in range(6, len(r)):
            if col_idx < len(vcc_headers):
                stage_name = vcc_headers[col_idx].strip()
                approver = r[col_idx].strip()
                if approver and approver != '-':
                    stages.append((stage_name, approver))
                    for u in approver.split(','):
                        if u.strip() and u.strip() not in ['ALL', '-']:
                            all_approvers.add(u.strip())
                    
        if cat and cat != 'ALL': vcc_groups[wf_name]['categories'].add(cat)
        if cc and cc != 'ALL': vcc_groups[wf_name]['costcenters'].add(cc)
        if br and br != 'ALL': vcc_groups[wf_name]['branches'].add(br)
        if not vcc_groups[wf_name]['stages'] and stages:
            vcc_groups[wf_name]['stages'] = stages

    print(f"\n[Summary] {len(sd_groups)} SD Company Profiles + {len(vcc_groups)} VCC Profiles = {len(sd_groups) + len(vcc_groups)} Master Combined Profiles!")
    print(f"[Summary] Found {len(all_approvers)} Unique Approver Employees in Matrix.")

    # 4. BULK SYNC ALL APPROVERS INTO USER MASTER
    print("\n[1/4] Syncing Approver Users into User Master...")
    # Admin first
    admin_u = User(
        user_uid="USR-000001",
        employee_id="ADMIN01",
        employee_name="System Administrator",
        name="System Administrator",
        username="admin",
        email="admin@docuflow.net",
        phone_number="+91 98421 00000",
        division="HQ",
        role="admin",
        password_hash=default_pw_hash,
        is_active=True,
        mfa_enabled=True,
        mfa_type="EMAIL",
        created_by="System SuperAdmin"
    )
    db.add(admin_u)

    for idx, u in enumerate(sorted(list(all_approvers))):
        role = "manager"
        if any(k in u for k in ["ABINAYA", "DINESH", "PRABHU", "SANTHOSH", "SRIKRISHNA", "IA"]):
            role = "finance_auditor"
        elif any(k in u for k in ["PGMOHAN", "RAJAVEL", "ADMIN"]):
            role = "admin" if "ADMIN" in u else "executive"
        elif any(k in u for k in ["NATHIYA", "REVATHI", "RAMANA", "RISHI"]):
            role = "employee"

        clean_name = u.split("_")[0].replace("-", " ").title()
        new_u = User(
            user_uid=f"USR-{100001 + idx}",
            employee_id=u,
            employee_name=clean_name,
            name=clean_name,
            username=u,
            email=f"{u.lower().replace('_', '.').replace(' ', '')}@ramrajcotton.net",
            phone_number=f"+91 98421 {idx:05d}",
            division="VCC",
            role=role,
            password_hash=default_pw_hash,
            is_active=True,
            mfa_enabled=(role in ["admin", "executive"]),
            mfa_type="EMAIL",
            created_by="Excel Master Import"
        )
        db.add(new_u)
    db.commit()

    created_workflows = {}
    created_conditions = []
    rule_priority = 10

    # 5. SEED SD WORKFLOW PROFILES & RULES (6 Master Profiles)
    print("\n[2/4] Inserting SD 4-Stage Workflow Profiles & Conditions...")
    for comp in SD_MAIN_COMPANIES:
        gdata = sd_groups[comp]
        profile_name = f"{comp}_ASSET WITH COST CENTER"
        
        wf_prof = WorkflowProfile(
            profile_name=profile_name,
            workflow_code=f"SD-{comp}-01",
            workflow_category="SD Asset Workflows",
            workflow_type="COMMON",
            description=f"SD 4-Stage Consolidated Approval Flow for {comp} ({len(gdata['costcenters'])} Cost Centers)",
            status="Active"
        )
        db.add(wf_prof)
        db.commit()
        created_workflows[profile_name] = wf_prof

        for idx, (stg_name, appr) in enumerate(gdata['stages']):
            action = "Upload & Verify" if "ATTACHMENT" in stg_name.upper() else ("Audit & Review" if "IA" in stg_name.upper() else "Approve")
            step_obj = WorkflowStepDefinition(
                profile_name=profile_name,
                stage_number=idx + 1,
                step_name=stg_name,
                approver_type="Approval Pool",
                approver_target=appr,
                action_required=action,
                permissions="Approve / Reject"
            )
            db.add(step_obj)
        db.commit()

        conds = [{"field": "Division", "operator": "equals", "value": comp, "logicalOperator": "AND"}]
        if gdata['costcenters']:
            cc_str = ", ".join(sorted(list(gdata['costcenters'])))
            conds.append({"field": "Cost Center", "operator": "Contains Any of", "value": cc_str, "logicalOperator": "AND"})
        else:
            conds.append({"field": "Category", "operator": "equals", "value": "ASSET WITH COST CENTER", "logicalOperator": "AND"})

        rule_name = f"Rule: SD - {comp} - Asset with Cost Center"
        brule = BusinessRule(
            rule_name=rule_name,
            rule_category="SD Asset Workflows",
            document_type="ANY",
            priority=rule_priority,
            target_workflow_id=profile_name,
            conditions_json=json.dumps(conds),
            description=f"SD Common Condition Rule for {comp} matching {len(gdata['costcenters'])} Cost Centers",
            is_active=True
        )
        db.add(brule)
        created_conditions.append(rule_name)
        rule_priority += 2
        db.commit()

    # 6. SEED VCC WORKFLOW PROFILES & RULES (25 Master Profiles)
    print("\n[3/4] Inserting VCC Regional Branch & Category Workflow Profiles & Conditions...")
    for wf_name, gdata in vcc_groups.items():
        profile_name = wf_name
        
        wf_prof = WorkflowProfile(
            profile_name=profile_name,
            workflow_code=f"VCC-{len(created_workflows)+1:02d}",
            workflow_category="VCC Voucher Workflows",
            workflow_type="COMMON",
            description=f"VCC Workflow for {len(gdata['branches'])} branches / categories",
            status="Active"
        )
        db.add(wf_prof)
        db.commit()
        created_workflows[profile_name] = wf_prof

        for idx, (stg_name, appr) in enumerate(gdata['stages']):
            action = "Audit & Review" if "IA" in stg_name.upper() else "Approve"
            step_obj = WorkflowStepDefinition(
                profile_name=profile_name,
                stage_number=idx + 1,
                step_name=stg_name,
                approver_type="Approval Pool",
                approver_target=appr,
                action_required=action,
                permissions="Approve / Reject"
            )
            db.add(step_obj)
        db.commit()

        conds = [{"field": "Division", "operator": "equals", "value": "VCC", "logicalOperator": "AND"}]
        if gdata['branches']:
            br_str = ", ".join(sorted(list(gdata['branches'])))
            conds.append({"field": "Plant", "operator": "Contains Any of", "value": br_str, "logicalOperator": "AND"})
        if gdata['categories']:
            cats_str = ", ".join(sorted(list(gdata['categories'])))
            conds.append({"field": "Category", "operator": "Contains Any of", "value": cats_str, "logicalOperator": "AND"})
        if gdata['costcenters']:
            cc_str = ", ".join(sorted(list(gdata['costcenters'])))
            conds.append({"field": "Cost Center", "operator": "Contains Any of", "value": cc_str, "logicalOperator": "AND"})

        rule_name = f"Rule: VCC - {profile_name}"
        brule = BusinessRule(
            rule_name=rule_name,
            rule_category="VCC Voucher Workflows",
            document_type="ANY",
            priority=rule_priority,
            target_workflow_id=profile_name,
            conditions_json=json.dumps(conds),
            description=f"VCC Common Condition Rule for {len(gdata['branches'])} combined branches",
            is_active=True
        )
        db.add(brule)
        created_conditions.append(rule_name)
        rule_priority += 2
        db.commit()

    # 7. DEMO INVOICES
    print("\n[4/4] Ensuring active demo invoices in database...")
    demo_invoices = [
        {
            "id": "DOC-101",
            "doc_key": 101,
            "doc_num": 5001,
            "vendor_name": "ABC INFOTECH SOLUTIONS",
            "invoice_number": "INV-2026-9812",
            "invoice_date": "2026-08-10",
            "po_number": "PO-99214",
            "amount": 145000.0,
            "base_amount": 122881.36,
            "tax_amount": 22118.64,
            "vendor_gstin": "33AAACA1234F1Z1",
            "division": "VCC",
            "plant": "TN-SIVAKASI",
            "category": "ASSET WITH COST CENTER",
            "cost_center": "IT-HARDWARE",
            "workflow_profile_id": "EVOUCHER_INV SR10",
            "status": "Initiated (FIRST APPROVAL)",
            "current_stage": 1,
            "total_stages": 2,
            "assigned_approver": "SIBITHA, VIVEK_00336",
            "file_url": "/sample.pdf"
        },
        {
            "id": "DOC-102",
            "doc_key": 102,
            "doc_num": 5002,
            "vendor_name": "SOUTHERN LOGISTICS CORP",
            "invoice_number": "FRT-88129",
            "invoice_date": "2026-08-09",
            "po_number": "PO-44819",
            "amount": 78200.0,
            "base_amount": 66271.19,
            "tax_amount": 11928.81,
            "vendor_gstin": "33AABCS5678G2Z4",
            "division": "ACC",
            "plant": "TN-CBE-SULUR",
            "category": "ASSET WITH COST CENTER",
            "cost_center": "BATTERY VEHICLE",
            "workflow_profile_id": "ACC_ASSET WITH COST CENTER",
            "status": "Initiated (ATTACHMENT STATUS)",
            "current_stage": 1,
            "total_stages": 4,
            "assigned_approver": "NATHIYA_16220, RAMANASUNDAR_E22-02094, REVATHI_E21-01819, RISHIKESAVAN_E25-00790",
            "file_url": "/sample.pdf"
        }
    ]

    for inv_data in demo_invoices:
        new_inv = Invoice(**inv_data)
        db.add(new_inv)
        db.commit()
        db.add(AuditLog(
            invoice_id=new_inv.id,
            user="System Engine",
            action="Document Synced & Auto-Routed",
            stage=f"Stage {new_inv.current_stage}",
            notes=f"Auto-routed to {new_inv.workflow_profile_id} with {new_inv.total_stages} stages."
        ))
        db.commit()

    print("\n==================================================================")
    print(f">>> COMPLETE: {len(created_workflows)} Workflows & {len(created_conditions)} Condition Rules Inserted Successfully!")
    print("==================================================================")
    db.close()

if __name__ == "__main__":
    seed_all_31_flows_and_conditions()
