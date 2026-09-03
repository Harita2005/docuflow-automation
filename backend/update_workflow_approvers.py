import sys
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import WorkflowStepDefinition

def update_approvers():
    db = SessionLocal()
    try:
        s1 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 1).update({
            'approver_target': 'YUVASREE',
            'approver_type': 'Specific Employee'
        }, synchronize_session=False)
        
        s2 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 2).update({
            'approver_target': 'Nattudurai',
            'approver_type': 'Specific Employee'
        }, synchronize_session=False)
        
        s3 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 3).update({
            'approver_target': 'VIGNESH',
            'approver_type': 'Specific Employee'
        }, synchronize_session=False)
        
        s4 = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number >= 4).update({
            'approver_target': 'VARUNAN',
            'approver_type': 'Specific Employee'
        }, synchronize_session=False)
        
        db.commit()
        print(f"[SUCCESS] Updated {s1} Stage 1 steps to YUVASREE, {s2} Stage 2 steps to Nattudurai, {s3} Stage 3 steps to VIGNESH, {s4} Stage 4+ steps to VARUNAN.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to update workflow steps: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_approvers()
