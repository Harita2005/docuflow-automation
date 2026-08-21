import sys
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import User, WorkflowProfile, WorkflowStepDefinition, Invoice
from app.auth import get_password_hash

def apply_four_approvers_all_workflows():
    print("==================================================================")
    print("   APPLYING 4-STAGE APPROVAL WORKFLOW TO ALL WORKFLOW PROFILES   ")
    print("   Stage 1: YUVASREE (E24-04070)                                  ")
    print("   Stage 2: Nattudurai                                            ")
    print("   Stage 3: VIGNESH_E25-01583                                     ")
    print("   Stage 4: VARUNAN (E22_02046)                                   ")
    print("==================================================================")

    db = SessionLocal()
    try:
        # -------------------------------------------------------------
        # 1. Ensure the 4 Approver Users exist and have active accounts
        # -------------------------------------------------------------
        print("\n[1/4] Ensuring 4 primary approvers exist in 'users' table...")
        
        # User 1: YUVASREE
        u1 = db.query(User).filter(
            (User.employee_id == 'E24-04070') | 
            (User.username == 'YUVASREE') | 
            (User.username == 'YUVASREE (E24-04070)') |
            (User.email == 'wmssupport@ramrajcotton.net')
        ).first()
        if not u1:
            u1 = User(
                user_uid='USR-YUVASREE-E24-04070',
                employee_id='E24-04070',
                employee_name='YUVASREE',
                name='YUVASREE',
                username='YUVASREE (E24-04070)',
                email='wmssupport@ramrajcotton.net',
                role='employee',
                password_hash=get_password_hash('password123'),
                is_active=True
            )
            db.add(u1)
        else:
            u1.employee_name = 'YUVASREE'
            u1.name = 'YUVASREE'
            u1.email = 'wmssupport@ramrajcotton.net'
            u1.role = 'employee'
            u1.is_active = True

        # User 2: Nattudurai
        u2 = db.query(User).filter(
            (User.username == 'NATTUDURAI') | 
            (User.username == 'Nattudurai') | 
            (User.employee_id == 'NATTUDURAI') | 
            (User.email == 'Nattudurai.s@ramrajcotton.net') |
            (User.email == 'Nattudural.s@ramrajcotton.net')
        ).first()
        if not u2:
            u2 = User(
                user_uid='USR-NATTUDURAI',
                employee_id='NATTUDURAI',
                employee_name='Nattudurai',
                name='Nattudurai',
                username='Nattudurai',
                email='Nattudurai.s@ramrajcotton.net',
                role='manager',
                password_hash=get_password_hash('password123'),
                is_active=True
            )
            db.add(u2)
        else:
            u2.employee_name = 'Nattudurai'
            u2.name = 'Nattudurai'
            u2.username = 'Nattudurai'
            u2.email = 'Nattudurai.s@ramrajcotton.net'
            u2.role = 'manager'
            u2.is_active = True

        # User 3: VIGNESH
        u3 = db.query(User).filter(
            (User.employee_id == 'E25-01583') | 
            (User.username == 'VIGNESH') | 
            (User.username == 'VIGNESH_E25-01583') |
            (User.email == 'vignesh.m@ramrajcotton.net')
        ).first()
        if not u3:
            u3 = User(
                user_uid='USR-VIGNESH-E25-01583',
                employee_id='E25-01583',
                employee_name='VIGNESH',
                name='VIGNESH',
                username='VIGNESH_E25-01583',
                email='vignesh.m@ramrajcotton.net',
                role='manager',
                password_hash=get_password_hash('password123'),
                is_active=True
            )
            db.add(u3)
        else:
            u3.employee_name = 'VIGNESH'
            u3.name = 'VIGNESH'
            u3.email = 'vignesh.m@ramrajcotton.net'
            u3.role = 'manager'
            u3.is_active = True

        # User 4: VARUNAN
        u4 = db.query(User).filter(
            (User.employee_id == 'E22-02046') | 
            (User.username == 'VARUNAN') | 
            (User.username == 'VARUNAN (E22_02046)') |
            (User.email == 'varunan.r@ramrajcotton.net')
        ).first()
        if not u4:
            u4 = User(
                user_uid='USR-VARUNAN-E22-02046',
                employee_id='E22-02046',
                employee_name='VARUNAN',
                name='VARUNAN',
                username='VARUNAN (E22_02046)',
                email='varunan.r@ramrajcotton.net',
                role='employee',
                password_hash=get_password_hash('password123'),
                is_active=True
            )
            db.add(u4)
        else:
            u4.employee_name = 'VARUNAN'
            u4.name = 'VARUNAN'
            u4.email = 'varunan.r@ramrajcotton.net'
            u4.role = 'employee'
            u4.is_active = True

        db.commit()
        print("  [OK] Successfully configured all 4 approver user accounts.")

        # -------------------------------------------------------------
        # 2. Update all Workflow Profiles with the 4-Stage Definitions
        # -------------------------------------------------------------
        print("\n[2/4] Updating all Workflow Profiles with 4 sequential stages...")
        profiles = db.query(WorkflowProfile).all()
        print(f"  Found {len(profiles)} workflow profiles to update.")

        # Delete old step definitions
        db.query(WorkflowStepDefinition).delete()
        db.commit()

        new_step_count = 0
        for p in profiles:
            p_name = p.profile_name
            w_type = p.workflow_type or 'AP INVOICE'

            # Stage 1: YUVASREE (E24-04070)
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=1,
                step_name="Attachment Status",
                approver_type="Specific Employee",
                approver_target="YUVASREE (E24-04070)",
                document_type=w_type,
                action_required="Approve",
                permissions="Approve / Reject",
                sla_hours=48
            ))

            # Stage 2: Nattudurai
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=2,
                step_name="Second Approval",
                approver_type="Specific Employee",
                approver_target="Nattudurai",
                document_type=w_type,
                action_required="Approve",
                permissions="Approve / Reject",
                sla_hours=48
            ))

            # Stage 3: VIGNESH_E25-01583
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=3,
                step_name="Third Approval",
                approver_type="Specific Employee",
                approver_target="VIGNESH_E25-01583",
                document_type=w_type,
                action_required="Approve",
                permissions="Approve / Reject",
                sla_hours=48
            ))

            # Stage 4: VARUNAN (E22_02046)
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=4,
                step_name="Final Approval",
                approver_type="Specific Employee",
                approver_target="VARUNAN (E22_02046)",
                document_type=w_type,
                action_required="Approve",
                permissions="Approve / Reject",
                sla_hours=48
            ))
            new_step_count += 4

        db.commit()
        print(f"  [OK] Created {new_step_count} step definitions across {len(profiles)} profiles (4 stages each).")

        # -------------------------------------------------------------
        # 3. Align All Invoices / Documents in Database
        # -------------------------------------------------------------
        print("\n[3/4] Aligning all existing invoices with 4 stages and current assigned approvers...")
        invoices = db.query(Invoice).all()
        for inv in invoices:
            inv.total_stages = 4
            stg = inv.current_stage or 1
            if stg == 1:
                inv.assigned_approver = "YUVASREE (E24-04070)"
            elif stg == 2:
                inv.assigned_approver = "Nattudurai"
            elif stg == 3:
                inv.assigned_approver = "VIGNESH_E25-01583"
            elif stg == 4:
                inv.assigned_approver = "VARUNAN (E22_02046)"
            else:
                inv.assigned_approver = "VARUNAN (E22_02046)"

        db.commit()
        print(f"  [OK] Updated {len(invoices)} invoices in database.")

        # -------------------------------------------------------------
        # 4. Summary & Verification
        # -------------------------------------------------------------
        print("\n[4/4] Verification check:")
        sample_inv = db.query(Invoice).first()
        if sample_inv:
            print(f"  Sample Invoice: ID={sample_inv.id}, Stage={sample_inv.current_stage}/4, Assigned={sample_inv.assigned_approver}")
        
        sample_steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == profiles[0].profile_name
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        for s in sample_steps:
            print(f"  Stage {s.stage_number}: {s.step_name} -> Approver: {s.approver_target}")

        print("\n==================================================================")
        print(">>> 100% COMPLETE: ALL WORKFLOWS NOW USE THE 4 DESIGNATED APPROVERS!")
        print("==================================================================")

    finally:
        db.close()

if __name__ == "__main__":
    apply_four_approvers_all_workflows()
