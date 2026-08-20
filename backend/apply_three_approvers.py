import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal, engine, Base
from app.models import WorkflowProfile, WorkflowStepDefinition, User
from app.auth import get_password_hash

def apply_three_approvers():
    db = SessionLocal()
    try:
        print(">>> 1. Ensuring 3 User Accounts in Master Database...")
        # 1. YUVASHREE_39592
        u1 = db.query(User).filter(User.username == 'YUVASHREE_39592').first()
        if not u1:
            u1 = User(
                user_uid='USR-YUVASHREE-39592',
                employee_id='YUVASHREE_39592',
                employee_name='Yuvasree',
                name='Yuvasree',
                username='YUVASHREE_39592',
                email='yuvasree@docuflow.local',
                password_hash=get_password_hash('password123'),
                role='manager',
                is_active=True
            )
            db.add(u1)
        else:
            u1.role = 'manager'
            u1.is_active = True

        # 2. VIGNESH_E25-01583
        u2 = db.query(User).filter(User.username == 'VIGNESH_E25-01583').first()
        if not u2:
            u2 = User(
                user_uid='USR-VIGNESH-E25-01583',
                employee_id='VIGNESH_E25-01583',
                employee_name='Vignesh',
                name='Vignesh',
                username='VIGNESH_E25-01583',
                email='vignesh@docuflow.local',
                password_hash=get_password_hash('password123'),
                role='manager',
                is_active=True
            )
            db.add(u2)
        else:
            u2.role = 'manager'
            u2.is_active = True

        # 3. VARUNAN (E22_02046)
        u3 = db.query(User).filter((User.employee_id == 'E22_02046') | (User.username == 'VARUNAN (E22_02046)')).first()
        if not u3:
            u3 = User(
                user_uid='USR-VARUNAN-E22-02046',
                employee_id='E22_02046',
                employee_name='VARUNAN (E22_02046)',
                name='VARUNAN (E22_02046)',
                username='VARUNAN (E22_02046)',
                email='varunan_e2202046@docuflow.local',
                password_hash=get_password_hash('password123'),
                role='manager',
                is_active=True
            )
            db.add(u3)
        else:
            u3.username = 'VARUNAN (E22_02046)'
            u3.employee_name = 'VARUNAN (E22_02046)'
            u3.name = 'VARUNAN (E22_02046)'
            u3.employee_id = 'E22_02046'
            u3.role = 'manager'
            u3.is_active = True

        db.commit()
        print(f"  [OK] 1. {u1.username} ({u1.employee_id})")
        print(f"  [OK] 2. {u2.username} ({u2.employee_id})")
        print(f"  [OK] 3. {u3.username} ({u3.employee_id})")

        print("\n>>> 2. Applying 3 Approval Stages Across ALL Workflow Profiles...")
        profiles = db.query(WorkflowProfile).all()
        print(f"  Found {len(profiles)} workflow profiles.")

        db.query(WorkflowStepDefinition).delete()

        new_steps = []
        for p in profiles:
            new_steps.append(WorkflowStepDefinition(
                profile_name=p.profile_name,
                stage_number=1,
                step_name='First Approval',
                approver_type='Approval Pool',
                approver_target='YUVASHREE_39592',
                document_type=p.workflow_type,
                action_required='Approve',
                permissions='Approve / Reject',
                sla_hours=48
            ))
            new_steps.append(WorkflowStepDefinition(
                profile_name=p.profile_name,
                stage_number=2,
                step_name='Second Approval',
                approver_type='Approval Pool',
                approver_target='VIGNESH_E25-01583',
                document_type=p.workflow_type,
                action_required='Approve',
                permissions='Approve / Reject',
                sla_hours=48
            ))
            new_steps.append(WorkflowStepDefinition(
                profile_name=p.profile_name,
                stage_number=3,
                step_name='Final Approval',
                approver_type='Specific Employee',
                approver_target='VARUNAN (E22_02046)',
                document_type=p.workflow_type,
                action_required='Approve',
                permissions='Approve / Reject',
                sla_hours=48
            ))

        db.bulk_save_objects(new_steps)
        db.commit()
        print(f"  [SUCCESS] Configured {len(new_steps)} stages across all {len(profiles)} profiles!")

        print("\n>>> 3. Aligning Existing Documents/Invoices to 3-Stage Approval Sequence...")
        from app.models import Invoice
        invoices = db.query(Invoice).all()
        print(f"  Found {len(invoices)} documents.")
        
        for inv in invoices:
            inv.total_stages = 3
            stage = inv.current_stage or 1
            if stage <= 1:
                inv.current_stage = 1
                inv.assigned_approver = "YUVASHREE_39592"
                if "Approved" not in (inv.status or "") and "Rejected" not in (inv.status or ""):
                    inv.status = "In Progress (Stage 1 - First Approval)"
            elif stage == 2:
                inv.assigned_approver = "VIGNESH_E25-01583"
                if "Approved" not in (inv.status or "") and "Rejected" not in (inv.status or ""):
                    inv.status = "In Progress (Stage 2 - Second Approval)"
            elif stage >= 3:
                inv.current_stage = 3
                inv.assigned_approver = "VARUNAN (E22_02046)"
                if "Approved" not in (inv.status or "") and "Rejected" not in (inv.status or ""):
                    inv.status = "In Progress (Stage 3 - Final Approval)"

        db.commit()
        print(f"  [SUCCESS] All {len(invoices)} documents updated to 3-stage approvers!")
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    apply_three_approvers()
