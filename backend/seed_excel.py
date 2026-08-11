import json
import datetime
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import User, WorkflowProfile, WorkflowStepDefinition, BusinessRule, Invoice, AuditLog
from app.auth import get_password_hash

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    print("=========================================================")
    print("Seeding Python FastAPI Database from Excel Approval Matrix")
    print("=========================================================")

    default_pw_hash = get_password_hash("password123")

    # 1. Approver Users List from Excel Matrix
    USERS_LIST = [
        {"username": "admin", "name": "System Administrator", "email": "admin@docuflow.net", "employee_id": "ADMIN01", "role": "admin"},
        {"username": "NATHIYA_16220", "name": "Nathiya", "email": "nathiya.16220@ramrajcotton.net", "employee_id": "16220", "role": "employee"},
        {"username": "RAMANASUNDAR_E22-02094", "name": "Ramanasundar", "email": "ramanasundar.e22-02094@ramrajcotton.net", "employee_id": "E22-02094", "role": "employee"},
        {"username": "REVATHI_E21-01819", "name": "Revathi", "email": "revathi.e21-01819@ramrajcotton.net", "employee_id": "E21-01819", "role": "employee"},
        {"username": "RISHIKESAVAN_E25-00790", "name": "Rishikesavan", "email": "rishikesavan.e25-00790@ramrajcotton.net", "employee_id": "E25-00790", "role": "employee"},
        {"username": "KANNADHASAN_8349", "name": "Kannadhasan", "email": "kannadhasan.8349@ramrajcotton.net", "employee_id": "8349", "role": "manager"},
        {"username": "ABINAYA_E25-06919", "name": "Abinaya", "email": "abinaya.e25-06919@ramrajcotton.net", "employee_id": "E25-06919", "role": "finance_auditor"},
        {"username": "DINESH_E21-02621", "name": "Dinesh", "email": "dinesh.e21-02621@ramrajcotton.net", "employee_id": "E21-02621", "role": "finance_auditor"},
        {"username": "PGMOHAN1176", "name": "PG Mohan", "email": "pgmohan1176@ramrajcotton.net", "employee_id": "1176", "role": "executive"},
        {"username": "RAJAVEL18285", "name": "Rajavel", "email": "rajavel18285@ramrajcotton.net", "employee_id": "18285", "role": "executive"},
        {"username": "JOTHIMANI_00339", "name": "Jothimani", "email": "jothimani.00339@ramrajcotton.net", "employee_id": "00339", "role": "manager"},
        {"username": "DHANABALAN_00337", "name": "Dhanabalan", "email": "dhanabalan.00337@ramrajcotton.net", "employee_id": "00337", "role": "manager"},
        {"username": "VIGASH_V20_00195", "name": "Vigash", "email": "vigash.v20-00195@ramrajcotton.net", "employee_id": "V20_00195", "role": "manager"},
        {"username": "SANTHOSHKUMAR_01180", "name": "Santhoshkumar", "email": "santhoshkumar.01180@ramrajcotton.net", "employee_id": "01180", "role": "manager"},
        {"username": "GOWTHAM_V20_00034", "name": "Gowtham", "email": "gowtham.v20-00034@ramrajcotton.net", "employee_id": "V20_00034", "role": "manager"},
        {"username": "MAHENDRAN_V21_00385", "name": "Mahendran", "email": "mahendran.v21-00385@ramrajcotton.net", "employee_id": "V21_00385", "role": "manager"},
        {"username": "YAMUNA_V21_00382", "name": "Yamuna", "email": "yamuna.v21-00382@ramrajcotton.net", "employee_id": "V21_00382", "role": "manager"},
        {"username": "PRASANTH_V19_01245", "name": "Prasanth", "email": "prasanth.v19-01245@ramrajcotton.net", "employee_id": "V19_01245", "role": "manager"},
        {"username": "ARAVINDAN_00630", "name": "Aravindan", "email": "aravindan.00630@ramrajcotton.net", "employee_id": "00630", "role": "manager"},
        {"username": "SIBITHA", "name": "Sibitha", "email": "sibitha@ramrajcotton.net", "employee_id": "SIBITHA", "role": "manager"},
        {"username": "VIVEK_00336", "name": "Vivek", "email": "vivek.00336@ramrajcotton.net", "employee_id": "00336", "role": "manager"},
        {"username": "PRABHU_E22_04214", "name": "Prabhu", "email": "prabhu.e22-04214@ramrajcotton.net", "employee_id": "E22_04214", "role": "finance_auditor"},
        {"username": "SANTHOSH_V21_00380", "name": "Santhosh", "email": "santhosh.v21-00380@ramrajcotton.net", "employee_id": "V21_00380", "role": "finance_auditor"},
        {"username": "SRIKRISHNA_V21_00282", "name": "Srikrishna", "email": "srikrishna.v21-00282@ramrajcotton.net", "employee_id": "V21_00282", "role": "finance_auditor"}
    ]

    print(f"\n[1/4] Syncing {len(USERS_LIST)} approver users into User Master...")
    for idx, u in enumerate(USERS_LIST):
        existing = db.query(User).filter((User.username == u["username"]) | (User.email == u["email"]) | (User.employee_id == u["employee_id"])).first()
        uid = f"USR-{100000 + idx}"
        if not existing:
            new_u = User(
                user_uid=uid,
                employee_id=u["employee_id"],
                employee_name=u["name"],
                name=u["name"],
                username=u["username"],
                email=u["email"],
                phone_number=f"+91 98765 {idx:05d}",
                division="VCC",
                role=u["role"],
                password_hash=default_pw_hash,
                is_active=True,
                mfa_enabled=(u["role"] in ["admin", "executive"]),
                mfa_type="EMAIL",
                created_by="System SuperAdmin",
                created_on=datetime.datetime.utcnow(),
                created_at=datetime.datetime.utcnow()
            )
            db.add(new_u)
        else:
            existing.user_uid = existing.user_uid or uid
            existing.employee_id = u["employee_id"]
            existing.employee_name = u["name"]
            existing.name = u["name"]
            existing.role = u["role"]
            existing.is_active = True
            existing.created_by = existing.created_by or "System SuperAdmin"
    db.commit()

    # 2. SD Asset Workflows (ACC, ENES, EIC, RCH, RMPL, RRTC)
    SD_COMPANIES = ["ACC", "ENES", "EIC", "RCH", "RMPL", "RRTC"]
    COST_CENTERS_JOINED = "BATTERY VEHICLE, CANTEEN MAINTENANCE, Office Maintenance, ORBITO BRAND PLOTTER MDL1512IJ, REFRIGERATOR, WASHING MACHINE, ACC WAREHOUSE BUILDING -NEW, BLITZ NUMBRING MACHINE, GARDEN EQUIPMENTS, IT-HARDWARE, IT-SOFTWARE, PAD PRINTING MACHINE-INKCUPS, AUTOMATED KERCHIEF HEMMING MCN, CCTV EQUIPMENTS, TELEVISION, AUTO PACKAGING SYSTEM CONVEYOR, ROOTS SWEEP MACHINE"

    print(f"\n[2/4] Seeding SD Asset Multi-Stage Workflows...")
    for comp in SD_COMPANIES:
        p_name = f"{comp}_ASSET WITH COST CENTER"
        existing_p = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == p_name).first()
        if not existing_p:
            existing_p = WorkflowProfile(
                profile_name=p_name,
                workflow_code=f"{comp}-AST-01",
                workflow_category="Vendor Payment Workflows",
                workflow_type="AP INVOICE",
                description=f"4-Stage Consolidated Asset Approval for {comp}",
                status="Active"
            )
            db.add(existing_p)
            db.commit()

        # Steps
        steps_data = [
            {"stage": 1, "name": "ATTACHMENT STATUS", "approver": "NATHIYA_16220,RAMANASUNDAR_E22-02094,REVATHI_E21-01819,RISHIKESAVAN_E25-00790", "action": "Attach File / Verify", "perm": "Upload and Verify Attachments"},
            {"stage": 2, "name": "FIRST APPROVAL", "approver": "KANNADHASAN_8349", "action": "Approve", "perm": "Approve / Reject"},
            {"stage": 3, "name": "IA APPROVAL", "approver": "ABINAYA_E25-06919,DINESH_E21-02621", "action": "Audit & Review", "perm": "Audit / Verify"},
            {"stage": 4, "name": "FINAL APPROVAL", "approver": "PGMOHAN1176,RAJAVEL18285", "action": "Final Authorization", "perm": "Executive Approval"}
        ]
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == p_name).delete()
        for s in steps_data:
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=s["stage"],
                step_name=s["name"],
                approver_target=s["approver"],
                action_required=s["action"],
                permissions=s["perm"]
            ))
        db.commit()

    # 3. VCC Regional Branch Workflows (SR1 to SR10 + HQ)
    VCC_BRANCH_WORKFLOWS = [
        {"code": "SR1", "name": "EVOUCHER_INV SR1", "approver": "JOTHIMANI_00339", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["AP-VIZIANAGARAM", "TN-CBE-RS PURAM", "TN-VELLORE", "TN-VILLUPURAM"]},
        {"code": "SR2", "name": "EVOUCHER_INV SR2", "approver": "DHANABALAN_00337", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["TN-CBE-SULUR", "TN-ERODE-BHAVANI", "TN-THURAIYUR", "TN-HOSUR", "TN-CBE-PN PALAYAM"]},
        {"code": "SR3", "name": "EVOUCHER_INV SR3", "approver": "VIGASH_V20_00195", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["TN-DHARMAPURI", "TN-TRICHY", "KL-TRIVANDRUM-PATTOM", "KL-KOTTAYAM", "TN-CBE-SINGANALLUR", "TN-SALEM", "TN-TUTICORIN", "KL-PALAKKAD"]},
        {"code": "SR4", "name": "EVOUCHER_INV SR4", "approver": "SANTHOSHKUMAR_01180", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["AP-VIZAG-GOPALAPATNAM", "TN-AVINASHI", "AP-TIRUPATHI AIRPORT", "KA-BGL-SHIVAJI NAGAR", "TN-CBE-METTUPALAYAM", "TN-KANNIYAKUMARI", "TN-KARAIKUDI", "KA-BGL-MARATHAHALLI", "KA-MANGALORE-II"]},
        {"code": "SR5", "name": "EVOUCHER_INV SR5", "approver": "GOWTHAM_V20_00034", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["AP-CHITTOOR-II", "AP-GUNTUR", "AP-SRIKAKULAM", "AP-VIJAYAWADA-M G ROAD", "TS-HYD-AMEERPET"]},
        {"code": "SR6", "name": "EVOUCHER_INV SR6", "approver": "MAHENDRAN_V21_00385", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["KA-BGL-HSR LAYOUT", "KA-BGL-JP NAGAR", "KA-BGL-RT NAGAR", "KA-BALLARI", "KA-BGL-KG ROAD"]},
        {"code": "SR7", "name": "EVOUCHER_INV SR7", "approver": "YAMUNA_V21_00382", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["TN-CHN-AMBATTUR", "TN-CHN-DOMESTIC APT", "TN-CHN-PADI", "TN-CHN-PALLIKARANAI", "TN-CHN-PONDYBAZAR", "TN-CHN-VELACHERY"]},
        {"code": "SR8", "name": "EVOUCHER_INV SR8", "approver": "PRASANTH_V19_01245", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["TN-TUP-ONLINE"]},
        {"code": "SR9", "name": "EVOUCHER_INV SR9", "approver": "ARAVINDAN_00630", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["TN-CBE-OPP STREET", "TN-DINDIGUL", "TN-ERODE", "TN-KANCHIPURAM", "TN-KARUR", "TN-MDU-AIRPORT", "TN-MDU-SELLUR", "TN-OOTY", "TN-PALANI", "TN-PATTUKOTTAI", "TN-THENI", "TN-TIRUNELVELI", "TN-TIRUNELVELI-VANNARPET", "TN-TUP-R and R FACTORY OUTLET", "TN-TUP-UTHUKULI ROAD", "TN-DG-ODDANCHATRAM"]},
        {"code": "SR10", "name": "EVOUCHER_INV SR10", "approver": "SIBITHA,VIVEK_00336", "ia": "PRABHU_E22_04214,SANTHOSH_V21_00380,SRIKRISHNA_V21_00282", "branches": ["TN-NAGERCOIL", "TN-UDUMALPET", "KA-MYSORE FORUM MALL", "TN-TRICHY-THIRUVANAIKOIL", "TN-CHN-CHROMPET", "TN-SIVAKASI"]},
        {"code": "SR", "name": "EVOUCHER_INV SR", "approver": "GOWTHAM_V20_00034,JAYAKUMAR_V19_00369", "ia": "BHUVANESH_01509,GOKULAVASAN_00219,PRABHU_E22_04214,PRADEEP_01867,SANTHOSH_V21_00380", "branches": ["HQ"]}
    ]

    print(f"\n[3/4] Seeding VCC Regional Branch Workflows & Rules...")
    priority = 10
    for v in VCC_BRANCH_WORKFLOWS:
        p = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == v["name"]).first()
        if not p:
            p = WorkflowProfile(
                profile_name=v["name"],
                workflow_code=f"VCC-{v['code']}",
                workflow_category="VCC Voucher Workflows",
                workflow_type="AP INVOICE",
                description=f"VCC Regional Voucher Approval ({v['code']}) for branches",
                status="Active"
            )
            db.add(p)
            db.commit()

        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == v["name"]).delete()
        db.add(WorkflowStepDefinition(profile_name=v["name"], stage_number=1, step_name="FIRST APPROVAL", approver_target=v["approver"], action_required="Approve"))
        db.add(WorkflowStepDefinition(profile_name=v["name"], stage_number=2, step_name="IA APPROVAL", approver_target=v["ia"], action_required="Audit & Review"))
        db.commit()

        # Business Rule
        r_name = f"Rule: VCC Voucher - {v['name']} (Clubbed Branches)"
        conds = [
            {"field": "Division", "operator": "equals", "value": "VCC", "logicalOperator": "AND"},
            {"field": "Plant", "operator": "Contains Any of", "value": ", ".join(v["branches"]), "logicalOperator": "AND"}
        ]
        r = db.query(BusinessRule).filter(BusinessRule.rule_name == r_name).first()
        if not r:
            r = BusinessRule(
                rule_name=r_name,
                target_workflow_id=v["name"],
                priority=priority,
                conditions_json=json.dumps(conds)
            )
            db.add(r)
        else:
            r.conditions_json = json.dumps(conds)
        priority += 5
        db.commit()

    # 4. Seed Demo Invoices matching Excel flows
    print("\n[4/4] Ensuring demo invoices exist...")
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
            "status": "In Progress (Stage 1)",
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
            "status": "In Progress (Stage 1)",
            "current_stage": 1,
            "total_stages": 4,
            "assigned_approver": "NATHIYA_16220, RAMANASUNDAR_E22-02094, REVATHI_E21-01819, RISHIKESAVAN_E25-00790",
            "file_url": "/sample.pdf"
        }
    ]

    for inv_data in demo_invoices:
        existing_inv = db.query(Invoice).filter(Invoice.id == inv_data["id"]).first()
        if not existing_inv:
            new_inv = Invoice(**inv_data)
            db.add(new_inv)
            db.commit()

            # Add initial audit log
            db.add(AuditLog(
                invoice_id=new_inv.id,
                user="System Engine",
                action="Document Synced & Auto-Routed",
                stage="Stage 1",
                notes=f"Auto-routed to {new_inv.workflow_profile_id} with {new_inv.total_stages} stages."
            ))
            db.commit()

    print("\n=========================================================")
    print("Python FastAPI Seeding Complete Successfully!")
    print("=========================================================")
    db.close()

if __name__ == "__main__":
    seed_database()
