import sys
import os
import json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.database import SessionLocal
from app.models import Document, BusinessRule
db = SessionLocal()
print('==========================================================')
print('  RESETTING DOCUMENT TO RAW POSTED DATA (UNROUTED):')
print('==========================================================')
doc = db.query(Document).filter(Document.invoice_number == 'INV-VCC-2026-002').first()
if doc:
    doc.workflow_profile_id = None
    doc.assigned_approver = None
    doc.status = 'Pending Approval'
    doc.current_stage = 1
    db.commit()
    print(f"[Reset] Document {doc.id} ('INV-VCC-2026-002') reset to raw posted data (unrouted).")
rule = db.query(BusinessRule).filter(BusinessRule.rule_name == 'VCC_FLOW').first()
if rule:
    try:
        conds = json.loads(rule.conditions_json)
        for c in conds.get('conditions', []):
            if c.get('field') == 'Cost Center':
                c['value'] = 'IT-HARDWARE'
        rule.conditions_json = json.dumps(conds)
        db.commit()
        print(f"[Reverted Rule] VCC_FLOW condition reverted back to 'IT-HARDWARE'.")
    except Exception as e:
        import logging
        logging.getLogger(__name__).debug('Handled exception: %s', e)
db.close()