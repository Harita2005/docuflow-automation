import sys
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal, engine, Base
import app.models
from app.models import User, WorkflowProfile, WorkflowStepDefinition, Invoice
from app.auth import get_password_hash

def ensure_user_safe(db, search_email, fallback_username, emp_id, emp_name, role_name):
    """Safely updates or creates a user without violating unique email/username constraints."""
    try:
        u = db.query(User).filter(User.email.ilike(search_email)).first()
        if not u:
            u = db.query(User).filter(User.username.ilike(fallback_username)).first()
        
        if not u:
            u = User(
                user_uid=f"USR-{fallback_username.upper()}",
                employee_id=emp_id,
                employee_name=emp_name,
                name=emp_name,
                username=fallback_username,
                email=search_email,
                role=role_name,
                password_hash=get_password_hash('password123'),
                is_active=True
            )
            db.add(u)
            db.commit()
            print(f"  [Created User] {fallback_username} ({search_email})")
        else:
            u.username = fallback_username
            u.name = emp_name
            u.employee_name = emp_name
            u.is_active = True
            db.commit()
            print(f"  [Updated User] ID={u.id} | {fallback_username} ({u.email})")
    except Exception as e:
        db.rollback()
        print(f"  [User Notice] Safe fallback for {fallback_username}: {e}")

def apply_four_approvers_all_workflows():
    print("==================================================================")
    print("   APPLYING 4-STAGE APPROVAL WORKFLOW TO ALL WORKFLOW PROFILES   ")
    print("   Stage 1: YUVASREE                                              ")
    print("   Stage 2: Nattudurai                                            ")
    print("   Stage 3: VIGNESH                                               ")
    print("   Stage 4: VARUNAN                                               ")
    print("==================================================================")

    # 1. Automatically create tables if database is fresh
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Notice during table check: {e}")

    db = SessionLocal()
    try:
        # -------------------------------------------------------------
        # 1. Ensure the 4 Approver Users exist and have active accounts
        # -------------------------------------------------------------
        print("\n[1/4] Ensuring 4 primary approvers exist in 'users' table...")
        ensure_user_safe(db, 'wmssupport@ramrajcotton.net', 'YUVASREE', 'E24-04070', 'YUVASREE', 'employee')
        ensure_user_safe(db, 'nattudurai.s@ramrajcotton.net', 'Nattudurai', 'NATTUDURAI', 'Nattudurai', 'manager')
        ensure_user_safe(db, 'vignesh.m@ramrajcotton.net', 'VIGNESH', 'E25-01583', 'VIGNESH', 'manager')
        ensure_user_safe(db, 'varunan.r@ramrajcotton.net', 'VARUNAN', 'E22-02046', 'VARUNAN', 'employee')

        # -------------------------------------------------------------
        # 2. Update all Workflow Profiles with the 4-Stage Definitions
        # -------------------------------------------------------------
        print("\n[2/4] Updating all Workflow Profiles with 4 sequential stages...")
        profiles = db.query(WorkflowProfile).all()
        if not profiles:
            print("  No workflow profiles found in DB. Seeding matrix from Excel first...")
            from seed_sd_workflow_matrix import seed_sd_matrix
            seed_sd_matrix()
            profiles = db.query(WorkflowProfile).all()
        
        print(f"  Found {len(profiles)} workflow profiles to update.")

        # Delete old step definitions in database
        db.query(WorkflowStepDefinition).delete()
        db.commit()

        new_step_count = 0
        for p in profiles:
            p_name = p.profile_name
            w_type = p.workflow_type or 'AP INVOICE'

            # Stage 1: YUVASREE
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=1,
                step_name="Attachment Status",
                approver_type="Specific Employee",
                approver_target="YUVASREE",
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

            # Stage 3: VIGNESH
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=3,
                step_name="Third Approval",
                approver_type="Specific Employee",
                approver_target="VIGNESH",
                document_type=w_type,
                action_required="Approve",
                permissions="Approve / Reject",
                sla_hours=48
            ))

            # Stage 4: VARUNAN
            db.add(WorkflowStepDefinition(
                profile_name=p_name,
                stage_number=4,
                step_name="Final Approval",
                approver_type="Specific Employee",
                approver_target="VARUNAN",
                document_type=w_type,
                action_required="Approve",
                permissions="Approve / Reject",
                sla_hours=48
            ))
            new_step_count += 4

        db.commit()
        print(f"  [OK] Successfully inserted {new_step_count} step definitions across {len(profiles)} profiles (4 stages each).")

        # -------------------------------------------------------------
        # 3. Migrate and Sync All Checklist Condition Rules
        # -------------------------------------------------------------
        print("\n[3/5] Migrating Checklist Rules from Excel...")
        try:
            from seed_checklists import seed_checklists_from_excel
            seed_checklists_from_excel()
        except Exception as e:
            print(f"  [Checklist Warning] Could not run seed_checklists: {e}")

        # -------------------------------------------------------------
        # 4. Align All Invoices / Documents in Database
        # -------------------------------------------------------------
        print("\n[4/5] Aligning all existing invoices with 4 stages and current assigned approvers...")
        invoices = db.query(Invoice).all()
        for inv in invoices:
            inv.total_stages = 4
            stg = inv.current_stage or 1
            if stg == 1:
                inv.assigned_approver = "YUVASREE"
            elif stg == 2:
                inv.assigned_approver = "Nattudurai"
            elif stg == 3:
                inv.assigned_approver = "VIGNESH"
            elif stg == 4:
                inv.assigned_approver = "VARUNAN"
            else:
                inv.assigned_approver = "VARUNAN"

        db.commit()
        print(f"  [OK] Updated {len(invoices)} invoices in database.")

        # -------------------------------------------------------------
        # 5. Summary & Verification
        # -------------------------------------------------------------
        print("\n[5/5] Verification check:")
        if profiles:
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
