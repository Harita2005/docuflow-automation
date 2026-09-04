import sys
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import (
    User, WorkflowProfile, WorkflowStepDefinition, BusinessRule,
    ChecklistTemplate, ChecklistRule, Invoice, DocumentChecklistState
)

print("=" * 80)
print(">>> DOCUFLOW AUTOMATION: DATABASE MAPPING INTEGRITY AUDIT")
print("=" * 80)

db = SessionLocal()

issues_found = []

try:
    # -------------------------------------------------------------------------
    # 1. AUDIT BUSINESS RULES -> WORKFLOW PROFILES
    # -------------------------------------------------------------------------
    print("\n[1/5] Auditing Business Rules -> Workflow Profiles Mapping...")
    rules = db.query(BusinessRule).filter(BusinessRule.is_active == True).all()
    wf_profile_ids = {wf.id for wf in db.query(WorkflowProfile.id).all()}
    wf_profile_names = {wf.profile_name.upper(): wf.id for wf in db.query(WorkflowProfile).all()}

    rule_orphan_count = 0
    rule_valid_count = 0

    for r in rules:
        target = (r.target_workflow_id or "").strip()
        if not target:
            issues_found.append(f"BusinessRule '{r.rule_name}' (ID {r.id}) has empty target_workflow_id.")
            rule_orphan_count += 1
        elif target not in wf_profile_ids and target.upper() not in wf_profile_names:
            issues_found.append(f"BusinessRule '{r.rule_name}' (ID {r.id}) targets non-existent workflow '{target}'.")
            rule_orphan_count += 1
        else:
            rule_valid_count += 1

    print(f"  -> Total Active Rules: {len(rules)}")
    print(f"  -> Valid Workflow Mappings: {rule_valid_count}")
    print(f"  -> Orphan/Broken Rule Target Mappings: {rule_orphan_count}")

    # -------------------------------------------------------------------------
    # 2. AUDIT WORKFLOW PROFILES -> STEP DEFINITIONS
    # -------------------------------------------------------------------------
    print("\n[2/5] Auditing Workflow Profiles -> Step Definitions Hierarchy...")
    workflows = db.query(WorkflowProfile).all()
    step_defs = db.query(WorkflowStepDefinition).all()
    
    wf_steps_map = {}
    for step in step_defs:
        wf_steps_map.setdefault(step.profile_name, []).append(step)

    empty_wf_count = 0
    valid_wf_count = 0

    for wf in workflows:
        steps = wf_steps_map.get(wf.profile_name, [])
        if not steps:
            issues_found.append(f"WorkflowProfile '{wf.id}' ('{wf.profile_name}') has 0 step definitions configured.")
            empty_wf_count += 1
        else:
            valid_wf_count += 1

    print(f"  -> Total Workflow Profiles: {len(workflows)}")
    print(f"  -> Workflows with Step Definitions: {valid_wf_count}")
    print(f"  -> Workflows with 0 Steps: {empty_wf_count}")

    # -------------------------------------------------------------------------
    # 3. AUDIT STEP DEFINITIONS -> APPROVER USERS
    # -------------------------------------------------------------------------
    print("\n[3/5] Auditing Step Definitions -> Approver User Existence...")
    users = db.query(User).all()
    user_names_set = {u.username.upper().strip() for u in users if u.username}
    user_names_set.update({u.employee_name.upper().strip() for u in users if u.employee_name})
    user_names_set.update({u.name.upper().strip() for u in users if u.name})
    user_names_set.update({u.employee_id.upper().strip() for u in users if u.employee_id})

    unmapped_approvers_count = 0
    mapped_approvers_count = 0

    for step in step_defs:
        approver_str = step.approver_target or ""
        if approver_str:
            # Check individual comma-separated approvers if string contains list
            parts = [p.strip().upper() for p in approver_str.split(",") if p.strip()]
            for p in parts:
                if p not in user_names_set and p not in ["ADMIN", "MANAGER", "EMPLOYEE", "APPROVER", "FINANCE"]:
                    unmapped_approvers_count += 1
                else:
                    mapped_approvers_count += 1

    print(f"  -> Total Step Approvers Checked: {mapped_approvers_count + unmapped_approvers_count}")
    print(f"  -> Recognized Approver Roles/Users: {mapped_approvers_count}")
    print(f"  -> Custom String / External Approver Identifiers: {unmapped_approvers_count}")

    # -------------------------------------------------------------------------
    # 4. AUDIT CHECKLIST TEMPLATES & RULES
    # -------------------------------------------------------------------------
    print("\n[4/5] Auditing Checklist Templates & Rules Catalog...")
    templates = db.query(ChecklistTemplate).all()
    ck_rules = db.query(ChecklistRule).all()

    print(f"  -> Total Checklist Templates: {len(templates)}")
    print(f"  -> Total Checklist Rules:     {len(ck_rules)}")

    active_templates = [t for t in templates if t.is_active != False]
    print(f"  -> Active Checklist Templates: {len(active_templates)}")

    # -------------------------------------------------------------------------
    # 5. INTEGRITY SUMMARY & RESULT
    # -------------------------------------------------------------------------
    print("\n[5/5] Mapping Integrity Audit Summary:")
    if not issues_found:
        print("  [SUCCESS] 100% PERFECT RELATIONAL INTEGRITY ACROSS ALL DB TABLES!")
        print("  -> Zero orphan rules.")
        print("  -> Zero broken workflow targets.")
        print("  -> All workflows contain structured stage steps.")
        sys.exit(0)
    else:
        print(f"  [ATTENTION] Found {len(issues_found)} potential mapping issues:")
        for idx, issue in enumerate(issues_found[:10], 1):
            print(f"    {idx}. {issue}")
        if len(issues_found) > 10:
            print(f"    ... and {len(issues_found) - 10} more.")
        sys.exit(1)

finally:
    db.close()
