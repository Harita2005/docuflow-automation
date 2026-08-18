from app.database import SessionLocal
from app.services.wf_engine import match_workflow, create_execution, get_execution_checklist
from app.models_wf import WfExecutionInput
import json, datetime

db = SessionLocal()

input_data = {'division': 'ACM', 'plant': None, 'category': 'GRN Header', 'cost_center': None}

inp = WfExecutionInput(
    source_system='TEST', external_record_id='TEST-001',
    division='ACM', category='GRN Header',
    raw_payload=json.dumps(input_data),
    received_at=datetime.datetime.utcnow(),
)
db.add(inp)
db.flush()

result = match_workflow(db, input_data, inp.input_id)
print('Matched:', result['matched'])
if result['matched']:
    print('Rule:', result['rule'].rule_name)
    print('Workflow:', result['workflow'].workflow_name)
    for c in result['conditions']:
        status = 'OK' if c['matched'] else 'FAIL'
        print(f'  [{status}] {c["field"]} ({c["operator"]}): expected={c["expected"]} actual={c["actual"]}')
    ex = create_execution(db, inp.input_id, result['rule'], result['workflow'])
    print('Execution ID:', ex.execution_id, '| Checklist items:', len(ex.checklist))
    cl = get_execution_checklist(db, ex.execution_id)
    print('Stages:', [s['stageName'] for s in cl['stages']])
else:
    print('Message:', result.get('message'))

db.rollback()
db.close()
