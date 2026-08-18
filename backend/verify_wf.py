from app.database import SessionLocal
from app.models_wf import WfWorkflow, WfRule, WfRuleCondition, WfRuleConditionValue, WfChecklistTemplate, WfChecklistStage, WfChecklistItem
db = SessionLocal()
print('Workflows:', db.query(WfWorkflow).count())
print('Rules:', db.query(WfRule).count())
print('Conditions:', db.query(WfRuleCondition).count())
print('Condition Values:', db.query(WfRuleConditionValue).count())
print('Templates:', db.query(WfChecklistTemplate).count())
print('Stages:', db.query(WfChecklistStage).count())
print('Items:', db.query(WfChecklistItem).count())
print()
print('Sample rules:')
for r in db.query(WfRule).limit(5).all():
    print(f'  [{r.priority}] {r.rule_name}')
print()
print('Sample workflows:')
for w in db.query(WfWorkflow).limit(5).all():
    print(f'  {w.workflow_code}: {w.workflow_name}')
db.close()
