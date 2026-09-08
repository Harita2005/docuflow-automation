import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import InvoiceChecklistState, ChecklistRule, ChecklistTemplate, Invoice

def purge_checklists():
    print("=" * 80)
    print(">>> PURGING ALL CHECKLIST TEMPLATES, RULES AND DOCUMENT STATES")
    print("=" * 80)
    
    db = SessionLocal()
    try:
        # 1. Delete document_checklist_states
        count_states = db.query(InvoiceChecklistState).count()
        db.query(InvoiceChecklistState).delete()
        print(f"  * Deleted {count_states} Document Checklist State records.")
        
        # 2. Delete checklist_rules
        count_rules = db.query(ChecklistRule).count()
        db.query(ChecklistRule).delete()
        print(f"  * Deleted {count_rules} Checklist Rule records.")
        
        # 3. Delete checklist_templates
        count_templates = db.query(ChecklistTemplate).count()
        db.query(ChecklistTemplate).delete()
        print(f"  * Deleted {count_templates} Checklist Template records.")
        
        # 4. Clear checklist_state column on Invoice / documents table
        invoices = db.query(Invoice).all()
        for inv in invoices:
            inv.checklist_state = "{}"
        print(f"  * Reset checklist_state JSON on {len(invoices)} invoice records.")
        
        db.commit()
        print("=" * 80)
        print(">>> ALL CHECKLIST DATA REMOVED SUCCESSFULLY FROM DATABASE")
        print("=" * 80)
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to purge checklists: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    purge_checklists()
