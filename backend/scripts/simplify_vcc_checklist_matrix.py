import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.database import SessionLocal
from app.models import ChecklistRule
db = SessionLocal()
print('==========================================================')
print('  SIMPLIFYING VCC CHECKLIST MATRIX RULES:')
print('==========================================================')
try:
    deleted = db.query(ChecklistRule).filter(ChecklistRule.division == 'VCC').delete()
    db.commit()
    print(f'[Cleanup] Removed {deleted} redundant VCC category rules.')
except Exception as e:
    import logging
    logging.getLogger(__name__).debug('Handled exception: %s', e)
vcc_attachment_items = ['Bill Amount Verified', 'Bill No ,Date & Address Verified', 'Documents Attached', 'Debit/Credit Note Verified', 'Gofrugal Entry with narration Verified', 'PO Verified', 'Showroom Inward details', 'Tax portion verified (GST, TDS, etc..)', 'Vendor GST no, Signaure Verified', 'Vendor Name', 'Showroom Name Verified']
vcc_first_approval_items = ['IA Final Audit & Sign-off', 'Tax portion verified (GST, TDS)', 'PO & Invoice Amounts Reconciled']
vcc_second_approval_items = ['Management Sign-off & Budget Review', 'Payment Release Authorization']
vcc_third_approval_items = ['Final Disbursement Verification', 'ERP Post Readiness & Financial Sign-off']
simplified_vcc_rules = [ChecklistRule(rule_name='VCC Purchase - Attachment Status (Global)', division='VCC', category='ALL', cost_center='ALL', branch='ALL', workflow_profile='ALL', stage_name='Attachment Status', item_text=' || '.join(vcc_attachment_items), is_mandatory=True, is_active=True, sequence_order=1), ChecklistRule(rule_name='VCC Purchase - First Approval (Global)', division='VCC', category='ALL', cost_center='ALL', branch='ALL', workflow_profile='ALL', stage_name='First Approval', item_text=' || '.join(vcc_first_approval_items), is_mandatory=True, is_active=True, sequence_order=2), ChecklistRule(rule_name='VCC Purchase - IA Approval (Global)', division='VCC', category='ALL', cost_center='ALL', branch='ALL', workflow_profile='ALL', stage_name='IA Approval', item_text=' || '.join(vcc_first_approval_items), is_mandatory=True, is_active=True, sequence_order=3), ChecklistRule(rule_name='VCC Purchase - Second Approval (Global)', division='VCC', category='ALL', cost_center='ALL', branch='ALL', workflow_profile='ALL', stage_name='Second Approval', item_text=' || '.join(vcc_second_approval_items), is_mandatory=True, is_active=True, sequence_order=4), ChecklistRule(rule_name='VCC Purchase - Third Approval (Global)', division='VCC', category='ALL', cost_center='ALL', branch='ALL', workflow_profile='ALL', stage_name='Third Approval', item_text=' || '.join(vcc_third_approval_items), is_mandatory=True, is_active=True, sequence_order=5)]
try:
    db.add_all(simplified_vcc_rules)
    db.commit()
    print(f'[Success] Simplified VCC Checklist Matrix down to 5 clean Global Rules!')
except Exception as e:
    import logging
    logging.getLogger(__name__).debug('Handled exception: %s', e)
total_count = db.query(ChecklistRule).count()
print(f'[Checklist Matrix Table] Total active rules remaining in database: {total_count}')
db.close()