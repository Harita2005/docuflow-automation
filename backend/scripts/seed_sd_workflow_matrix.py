import os
import sys
import json
import zipfile
import xml.etree.cElementTree as ET
from pathlib import Path
from collections import defaultdict
BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import WorkflowProfile, WorkflowStepDefinition, BusinessRule, ChecklistTemplate
from app.services.rules_engine import calculate_rule_priority, is_wildcard

candidate_paths = [
    BACKEND_DIR / "data" / "SD Checklists.xlsx",
    BACKEND_DIR / "data" / "SD SCHEMA AND WORKFLOW DETAILS.xlsx",
    BASE_DIR / "SD Checklists.xlsx",
    Path("/app/data/SD Checklists.xlsx"),
    Path("/app/SD Checklists.xlsx"),
    Path.cwd() / "SD Checklists.xlsx",
    BACKEND_DIR / "SD Checklists.xlsx"
]
EXCEL_PATH = next((p for p in candidate_paths if p.exists()), candidate_paths[0])

def infer_document_type(name: str, cat: str = "") -> str:
    n = (name + " " + cat).upper()
    if "EVOUCHER" in n or "E-VOUCHER" in n or "E_VOUCHER" in n:
        return "E-VOUCHER"
    elif "ASSET" in n or "CAPEX" in n or "MACHINERY" in n or "MACHINE" in n:
        return "CAPEX / FIXED ASSET"
    elif "GRN" in n or "STOCK" in n or "GOODS" in n:
        return "GRN / GOODS RECEIPT"
    elif "CASHFLOW" in n or "CASH_FLOW" in n or "PETTY" in n or "CASH FLOW" in n:
        return "CASH VOUCHER"
    elif "FREIGHT" in n or "TRANSPORT" in n or "COURIER" in n or "POSTAGE" in n:
        return "FREIGHT & LOGISTICS"
    elif "RENT" in n or "EB" in n or "ELECTRICITY" in n or "POWER" in n:
        return "UTILITY & RENT"
    elif "TRAVEL" in n or "WELFARE" in n or "INCENTIVE" in n or "SALARY" in n:
        return "STAFF & HR EXPENSE"
    elif "PURCHASE" in n or "PO_" in n:
        return "PURCHASE INVOICE"
    elif "MAINTENANCE" in n or "REPAIRS" in n or "SERVICE" in n:
        return "SERVICE & MAINTENANCE"
    elif "ADVANCE" in n:
        return "ADVANCE VOUCHER"
    elif "JRNL" in n or "JOURNAL" in n:
        return "JOURNAL VOUCHER"
    else:
        return "ACCOUNTS PAYABLE (AP)"

def seed_sd_workflow_matrix():
    print("==================================================================")
    print(">>> SEEDING ENTERPRISE WORKFLOW FLOWS & MULTI-FIELD CONDITIONS")
    print(f">>> Source: {EXCEL_PATH}")
    print("==================================================================")

    if not EXCEL_PATH.exists():
        print(f"[ERROR] Excel file not found at: {EXCEL_PATH}")
        return

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        with zipfile.ZipFile(str(EXCEL_PATH), 'r') as z:
            # 1. Load shared strings
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t_elems = si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    shared_strings.append(''.join([t.text for t in t_elems if t.text]))

            # 2. Get workbook sheet mapping
            wb_tree = ET.fromstring(z.read('xl/workbook.xml'))
            rels_tree = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            rel_map = {rel.attrib.get('Id'): rel.attrib.get('Target') for rel in rels_tree.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')}
            sheets = {sheet.attrib.get('name'): 'xl/' + rel_map[sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')] for sheet in wb_tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet')}

            all_profiles = {}  # profile_name -> { info, steps: [(stage_num, stage_name, approver_pool)] }
            # Rule grouping: (profile_name, company, category) -> { branches: set(), costcenters: set(), paymodes: set() }
            rule_groups = defaultdict(lambda: {
                'branches': set(),
                'costcenters': set(),
                'paymodes': set()
            })

            for sname in ['SD WORKFLOW', 'VCC WORKFLOW']:
                if sname not in sheets:
                    continue
                print(f"\nProcessing sheet: {sname}...")
                tree = ET.fromstring(z.read(sheets[sname]))
                rows_elem = tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                
                print(f"  Rows count: {len(rows_elem)}")

                for row in rows_elem[1:]:
                    cells = {}
                    for c in row.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                        r_ref = c.attrib.get('r')
                        col_letter = ''.join([char for char in r_ref if char.isalpha()])
                        v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        val = v.text if v is not None else ''
                        if c.attrib.get('t') == 's' and val.isdigit() and int(val) < len(shared_strings):
                            val = shared_strings[int(val)]
                        cells[col_letter] = val

                    cat_name = cells.get('A', '').strip()
                    company = cells.get('B', '').strip()
                    category = cells.get('C', '').strip()
                    costcenter = cells.get('D', '').strip()
                    branch = cells.get('E', '').strip()
                    paymode = cells.get('F', '').strip()

                    if not cat_name or not company:
                        continue

                    # Extract Stage Columns
                    if sname == 'SD WORKFLOW':
                        stage_cols = [
                            ('Attachment Status', cells.get('G')),
                            ('First Approval', cells.get('H')),
                            ('Second Approval', cells.get('I')),
                            ('3rd APPROVAL', cells.get('J')),
                            ('IA Approval', cells.get('K')),
                            ('Final Approval', cells.get('L'))
                        ]
                    else:
                        stage_cols = [
                            ('Attachment Status', cells.get('G')),
                            ('First Approval', cells.get('H')),
                            ('Second Approval', cells.get('I')),
                            ('IA Approval', cells.get('J')),
                            ('Final Approval', cells.get('K')),
                            ('3rd APPROVAL', cells.get('L'))
                        ]

                    active_steps = []
                    for st_name, pool in stage_cols:
                        if pool and pool.strip():
                            active_steps.append((st_name, pool.strip()))

                    if cat_name not in all_profiles and active_steps:
                        doc_type_inferred = infer_document_type(cat_name, category)
                        parent_company = company.split('_')[0].split('-')[0].strip().upper()
                        cat_label = f"{parent_company} Division Workflows" if parent_company not in ['SD ASSET', 'SD'] else 'SD Asset Workflows'
                        all_profiles[cat_name] = {
                            'profile_name': cat_name,
                            'workflow_code': cat_name[:50],
                            'workflow_category': cat_label,
                            'workflow_type': doc_type_inferred,
                            'description': f"Automated matrix workflow for {cat_name} ({company})",
                            'steps': [(idx + 1, st_name, pool) for idx, (st_name, pool) in enumerate(active_steps)]
                        }

                    # Aggregate grouping
                    grp_key = (cat_name, company, category)
                    if branch:
                        rule_groups[grp_key]['branches'].add(branch)
                    if costcenter:
                        rule_groups[grp_key]['costcenters'].add(costcenter)
                    if paymode:
                        rule_groups[grp_key]['paymodes'].add(paymode)

        # ----------------------------------------------------
        # 1. Sync Workflow Profiles & Step Definitions
        # ----------------------------------------------------
        print(f"\n[1/3] Syncing {len(all_profiles)} Workflow Profiles & Steps into database...")
        synced_p = 0
        synced_s = 0

        for p_name, p_data in all_profiles.items():
            existing_p = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == p_name).first()
            if not existing_p:
                new_p = WorkflowProfile(
                    profile_name=p_name,
                    workflow_code=p_data['workflow_code'],
                    workflow_category=p_data['workflow_category'],
                    workflow_type=p_data['workflow_type'],
                    description=p_data['description'],
                    status='Active',
                    approval_threshold=100,
                    rejection_handling='Return to Previous Step',
                    reminder_interval_hours=24,
                    escalation_after_hours=48,
                    auto_escalation=False
                )
                db.add(new_p)
                db.flush()
                synced_p += 1

            # Populate exact stages and approver pools from Excel
            db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == p_name).delete()
            for stage_num, st_name, pool in p_data['steps']:
                target = "YUVASREE" if stage_num == 1 else "Nattudurai" if stage_num == 2 else "VIGNESH" if stage_num == 3 else "VARUNAN"
                db.add(WorkflowStepDefinition(
                    profile_name=p_name,
                    stage_number=stage_num,
                    step_name=st_name,
                    approver_type='Specific Employee',
                    approver_target=target,
                    document_type=p_data['workflow_type'],
                    action_required='Approve',
                    permissions='Approve / Reject',
                    sla_hours=48
                ))
                synced_s += 1

        db.commit()
        print(f"  [OK] Synced {synced_p} new profiles and {synced_s} step definitions (actual stages from Excel).")
        print(f"  Total Profiles in table: {db.query(WorkflowProfile).count()}")
        print(f"  Total Step Definitions in table: {db.query(WorkflowStepDefinition).count()}")

        # ----------------------------------------------------
        # 2. Generate and Sync Consolidated Business Routing Rules
        # ----------------------------------------------------
        print(f"\n[2/3] Generating consolidated condition rules (grouping common conditions together)...")
        
        # Consolidate common conditions by (cat_name, parent_company)
        consolidated_groups = defaultdict(lambda: {
            'companies': set(),
            'categories': set(),
            'branches': set(),
            'costcenters': set(),
            'doc_type': ''
        })

        for (cat_name, company, category), data in rule_groups.items():
            parent_comp = company.split('_')[0].split('-')[0].strip().upper()
            grp_key = (cat_name, parent_comp)
            consolidated_groups[grp_key]['companies'].add(company)
            if category and category != 'ALL':
                consolidated_groups[grp_key]['categories'].add(category)
            for b in data['branches']:
                if b and b != 'ALL': consolidated_groups[grp_key]['branches'].add(b)
            for cc in data['costcenters']:
                if cc and cc != 'ALL': consolidated_groups[grp_key]['costcenters'].add(cc)
            consolidated_groups[grp_key]['doc_type'] = infer_document_type(cat_name, category)

        generated_rules = []
        rule_idx = 1000

        for (cat_name, parent_comp), data in consolidated_groups.items():
            rule_idx += 1
            companies = sorted(list(data['companies']))
            categories = sorted(list(data['categories']))
            branches = sorted(list(data['branches']))
            costcenters = sorted(list(data['costcenters']))
            doc_type_for_rule = data['doc_type']

            comp_val = ", ".join(companies) if len(companies) <= 10 else parent_comp
            cat_val = ", ".join(categories) if len(categories) <= 20 else "ALL"
            branch_val = ", ".join(branches) if len(branches) <= 30 else "ALL"
            cc_val = ", ".join(costcenters) if len(costcenters) <= 30 else "ALL"

            conditions = [
                {"field": "Division", "operator": "contains any of" if "," in comp_val else "equals", "value": comp_val, "logicalOperator": "AND"}
            ]

            if cat_val != "ALL" and cat_val:
                conditions.append({"field": "Category", "operator": "contains any of" if "," in cat_val else "equals", "value": cat_val, "logicalOperator": "AND"})

            if branch_val != "ALL" and branch_val:
                conditions.append({"field": "Branch", "operator": "contains any of" if "," in branch_val else "equals", "value": branch_val, "logicalOperator": "AND"})

            if cc_val != "ALL" and cc_val:
                conditions.append({"field": "Cost Center", "operator": "contains any of" if "," in cc_val else "equals", "value": cc_val, "logicalOperator": "AND"})

            # Priority calculation based on specificity (centralized in rules_engine)
            priority = calculate_rule_priority(cat_val, branch_val, cc_val, base_priority=50)

            rule_name = f"RULE_{parent_comp}_{cat_name[:40]}".replace(" ", "_").replace("&", "_").replace("/", "_").strip("_")
            rule_name = f"{rule_name}_{rule_idx}"
            rule_cat = f"{parent_comp} Division Workflows" if parent_comp not in ['SD ASSET', 'SD'] else 'SD Asset Workflows'

            generated_rules.append({
                "rule_name": rule_name,
                "rule_category": rule_cat,
                "document_type": doc_type_for_rule,
                "priority": priority,
                "target_workflow_id": cat_name,
                "conditions_json": json.dumps({"conditions": conditions}),
                "description": f"Consolidated rule for {parent_comp} -> {cat_name} ({len(categories)} categories, {len(branches)} branches, {len(costcenters)} cost centers)",
                "is_active": True
            })

        print(f"  Generated {len(generated_rules)} consolidated condition rules.")

        # Wipe old fragmented auto-generated rules and insert clean consolidated rules
        db.query(BusinessRule).delete()
        db.commit()

        for r_dict in generated_rules:
            new_r = BusinessRule(
                rule_name=r_dict['rule_name'],
                rule_category=r_dict['rule_category'],
                document_type=r_dict['document_type'],
                priority=r_dict['priority'],
                target_workflow_id=r_dict['target_workflow_id'],
                conditions_json=r_dict['conditions_json'],
                description=r_dict['description'],
                is_active=True
            )
            db.add(new_r)

        db.commit()
        print(f"  [OK] Saved {len(generated_rules)} consolidated Business Rules.")
        print(f"  Total Business Rules in table: {db.query(BusinessRule).count()}")

        # ----------------------------------------------------
        # 3. Verify Rules Engine Evaluation on Test Cases
        # ----------------------------------------------------
        print("\n[3/3] Testing Condition Evaluation Engine...")
        from app.services.rules_engine import evaluate_business_rules

        class MockInvoice:
            def __init__(self, division, plant, category, cost_center, amount=5000):
                self.division = division
                self.plant = plant
                self.category = category
                self.cost_center = cost_center
                self.amount = amount
                self.document_type = "AP INVOICE"
                self.vendor_name = "Test Vendor"
                self.tax_amount = 900
                self.custom_data = None

        inv1 = MockInvoice("VCC", "TN-ERODE-PERUNDURAI ROAD", "Freight and Forwarding Charges", "DIGITAL MARKETING")
        matched1 = evaluate_business_rules(db, inv1)
        print(f"  Test 1 [VCC Freight] matched workflow profile: {matched1}")

        inv2 = MockInvoice("ACC", "ATITHYA-EXCISE", "ACCESSORIES - COMPUTER", "Office Maintenance")
        matched2 = evaluate_business_rules(db, inv2)
        print(f"  Test 2 [ACC Asset] matched workflow profile: {matched2}")

        inv3 = MockInvoice("ATC", "BHAVANI", "MACHINERY", "PRODUCTION TABLE")
        matched3 = evaluate_business_rules(db, inv3)
        print(f"  Test 3 [ATC Machinery] matched workflow profile: {matched3}")

        print("\n==================================================================")
        print(">>> SUCCESS: WORKFLOW FLOWS & CONDITIONS SEEDED SUCCESSFULLY!")
        print("==================================================================")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Seeding failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_sd_workflow_matrix()
