from app.services.rules_engine import match_field_value, evaluate_rule_conditions, resolve_step_approvers
from app.database.models import Document, WorkflowStepDefinition

def test_condition_operators():
    # Equals
    assert match_field_value('VCC', 'VCC', 'equals') is True
    assert match_field_value('VCC', 'SD', 'equals') is False

    # Not Equals
    assert match_field_value('VCC', 'SD', 'not equals') is True
    assert match_field_value('VCC', 'VCC', 'not equals') is False

    # Starts with / Ends with
    assert match_field_value('INV', 'INV-2026-001', 'starts_with') is True
    assert match_field_value('001', 'INV-2026-001', 'ends_with') is True

    # In / Not In
    assert match_field_value('VCC, SD, HQ', 'SD', 'in') is True
    assert match_field_value('VCC, SD, HQ', 'EXPORT', 'not in') is True

    # Numeric comparison
    assert match_field_value('50000', '75000', '>=') is True
    assert match_field_value('50000', '25000', '>=') is False

    # Invalid operator must fail-closed (return False, never silently True)
    assert match_field_value('VCC', 'VCC', 'unknown_invalid_op') is False

def test_evaluate_rule_conditions_fail_closed():
    doc = Document(id='DOC-01', division='VCC', amount=50000.0)
    
    # Empty conditions must fail-closed (False)
    assert evaluate_rule_conditions([], doc) is False
    assert evaluate_rule_conditions(None, doc) is False

    # Malformed condition must fail-closed
    assert evaluate_rule_conditions([{'invalid_key': 'abc'}], doc) is False

    # Valid condition match
    valid_cond = [{'field': 'division', 'operator': 'equals', 'value': 'VCC'}]
    assert evaluate_rule_conditions(valid_cond, doc) is True

def test_approver_resolution(db_session, seed_test_data):
    doc = Document(id='DOC-VCC-01', division='VCC')
    step = WorkflowStepDefinition(step_name='GM Review', approver_target='vcc_gm')
    
    approvers = resolve_step_approvers(db_session, step, doc)
    assert len(approvers) >= 1
    assert any(u.username == 'vcc_gm' for u in approvers)

    # Inactive users must NEVER be resolved
    inactive_step = WorkflowStepDefinition(step_name='Inactive Step', approver_target='inactive_user')
    inactive_approvers = resolve_step_approvers(db_session, inactive_step, doc)
    # inactive_user must NOT be in resolved approvers (should fallback to Admin/Division Head)
    assert not any(u.username == 'inactive_user' for u in inactive_approvers)
    assert any(u.role in ['admin', 'gm'] for u in inactive_approvers)
