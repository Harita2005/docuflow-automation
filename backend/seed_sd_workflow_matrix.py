import os
import sys
import json
import zipfile
import xml.etree.cElementTree as ET
from pathlib import Path
from collections import defaultdict
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import WorkflowProfile, WorkflowStepDefinition, BusinessRule, ChecklistTemplate

BASE_DIR = Path(__file__).resolve().parent
EXCEL_PATH = BASE_DIR / "SD SCHEMA AND WORKFLOW DETAILS.xlsx"
if not EXCEL_PATH.exists():
    EXCEL_PATH = BASE_DIR.parent / "SD SCHEMA AND WORKFLOW DETAILS.xlsx"

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
                        all_profiles[cat_name] = {
                            'profile_name': cat_name,
                            'workflow_code': cat_name[:50],
                            'workflow_category': f"{company} Workflow Matrix",
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
                synced_p += 1
            else:
                existing_p.workflow_type = p_data['workflow_type']

            for s_num, s_name, pool in p_data['steps']:
                existing_s = db.query(WorkflowStepDefinition).filter(
                    WorkflowStepDefinition.profile_name == p_name,
                    WorkflowStepDefinition.stage_number == s_num
                ).first()
                if not existing_s:
                    new_s = WorkflowStepDefinition(
                        profile_name=p_name,
                        stage_number=s_num,
                        step_name=s_name,
                        approver_type='Approval Pool',
                        approver_target=pool,
                        document_type=p_data['workflow_type'],
                        action_required='Approve',
                        permissions='Approve / Reject',
                        sla_hours=48
                    )
                    db.add(new_s)
                    synced_s += 1
                else:
                    existing_s.approver_target = pool
                    existing_s.step_name = s_name
                    existing_s.document_type = p_data['workflow_type']

        db.commit()
        print(f"  [OK] Synced {synced_p} new profiles and {synced_s} step definitions.")
        print(f"  Total Profiles in table: {db.query(WorkflowProfile).count()}")
        print(f"  Total Step Definitions in table: {db.query(WorkflowStepDefinition).count()}")

        # ----------------------------------------------------
        # 2. Generate and Sync Business Routing Rules
        # ----------------------------------------------------
        print(f"\n[2/3] Generating multi-attribute condition rules (Division, Branch, Doc Type, Cost Center)...")
        generated_rules = []
        rule_idx = 1000

        # Create Category/Division/Branch/CostCenter level rules
        for (cat_name, company, category), data in rule_groups.items():
            rule_idx += 1
            branches = sorted(list(data['branches']))
            costcenters = sorted(list(data['costcenters']))
            doc_type_for_rule = infer_document_type(cat_name, category)

            # Determine branch condition value
            if not branches or 'ALL' in branches or len(branches) > 50:
                branch_val = "ALL"
            else:
                branch_val = ", ".join(branches)

            # Determine cost center condition value
            if not costcenters or 'ALL' in costcenters or len(costcenters) > 30:
                cc_val = "ALL"
            else:
                cc_val = ", ".join(costcenters)

            conditions = [
                {"field": "Division", "operator": "equals", "value": company, "logicalOperator": "AND"}
            ]

            if category and category != 'ALL':
                conditions.append({"field": "Category", "operator": "equals", "value": category, "logicalOperator": "AND"})

            if branch_val != "ALL":
                conditions.append({"field": "Branch", "operator": "contains any of", "value": branch_val, "logicalOperator": "AND"})

            if cc_val != "ALL":
                conditions.append({"field": "Cost Center", "operator": "contains any of", "value": cc_val, "logicalOperator": "AND"})

            # Priority calculation based on specificity
            priority = 50
            if category and category != 'ALL':
                priority += 20
            if branch_val != 'ALL':
                priority += 15
            if cc_val != 'ALL':
                priority += 15

            rule_name = f"RULE_{company}_{category[:25]}_{cat_name[:20]}".replace(" ", "_").replace("&", "_").replace("/", "_").strip("_")
            rule_name = f"{rule_name}_{rule_idx}"

            generated_rules.append({
                "rule_name": rule_name,
                "rule_category": f"{company} Workflow Matrix",
                "document_type": doc_type_for_rule,
                "priority": priority,
                "target_workflow_id": cat_name,
                "conditions_json": json.dumps({"conditions": conditions}),
                "description": f"Auto-generated rule for {company} - {category} -> {cat_name} (Branch: {branch_val[:40]}, CC: {cc_val[:40]})",
                "is_active": True
            })

        print(f"  Generated {len(generated_rules)} condition rules.")

        # Sync into BusinessRule table
        synced_r = 0
        for r_dict in generated_rules:
            existing_r = db.query(BusinessRule).filter(BusinessRule.rule_name == r_dict['rule_name']).first()
            if not existing_r:
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
                synced_r += 1
            else:
                existing_r.document_type = r_dict['document_type']

        db.commit()
        print(f"  [OK] Inserted {synced_r} new Business Rules.")
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
