"""
Clean Up Users and Update Workflow Approvers Script for Server Deployment
Runs on SQL Server / SQLite to restrict active users to 5 designated members
and synchronize 4-stage workflow step definitions.
"""
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal, engine
from app.models import User, WorkflowStepDefinition, Document

def run_server_cleanup():
    db = SessionLocal()
    print("==================================================================")
    print(">>> RUNNING SERVER USER CLEANUP & WORKFLOW APPROVERS SYNC")
    print("==================================================================")

    # 1. Soft-delete all sample users except the 5 designated members (admin + 4 approvers)
    keep_usernames_lower = ["admin", "yuvasree", "nattudurai", "vignesh", "varunan"]
    all_users = db.query(User).all()
    deleted_count = 0
    for u in all_users:
        if u.username and u.username.lower() not in keep_usernames_lower:
            u.is_deleted = True
            deleted_count += 1
        elif u.username and u.username.lower() in keep_usernames_lower:
            u.is_deleted = False
    db.commit()

    active_users = [u.username for u in db.query(User).filter(User.is_deleted == False).all()]
    print(f"[1/3] Soft-deleted {deleted_count} sample users.")
    print(f"      Active users remaining ({len(active_users)}): {active_users}")

    # 2. Update all workflow step definitions across all workflow profiles
    s1 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 1).update({'approver_target': 'YUVASREE'}, synchronize_session=False)
    s2 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 2).update({'approver_target': 'Nattudurai'}, synchronize_session=False)
    s3 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 3).update({'approver_target': 'VIGNESH'}, synchronize_session=False)
    s4 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number >= 4).update({'approver_target': 'VARUNAN'}, synchronize_session=False)
    db.commit()

    print(f"[2/3] Updated Workflow Steps -> Stage 1: {s1}, Stage 2: {s2}, Stage 3: {s3}, Stage 4+: {s4}")

    # 3. Synchronize active documents assigned approver to match stage approvers
    d1 = db.query(Document).filter(Document.current_stage == 1, Document.is_deleted == False).update({'assigned_approver': 'YUVASREE'}, synchronize_session=False)
    d2 = db.query(Document).filter(Document.current_stage == 2, Document.is_deleted == False).update({'assigned_approver': 'Nattudurai'}, synchronize_session=False)
    d3 = db.query(Document).filter(Document.current_stage == 3, Document.is_deleted == False).update({'assigned_approver': 'VIGNESH'}, synchronize_session=False)
    d4 = db.query(Document).filter(Document.current_stage >= 4, Document.is_deleted == False).update({'assigned_approver': 'VARUNAN'}, synchronize_session=False)
    db.commit()

    print(f"[3/3] Updated Active Documents Queue -> Stage 1: {d1}, Stage 2: {d2}, Stage 3: {d3}, Stage 4: {d4}")
    db.close()

    print("\n[SUCCESS] Server user cleanup & workflow stage approver sync complete!")

if __name__ == "__main__":
    run_server_cleanup()
