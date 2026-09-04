import sys
from collections import defaultdict
from sqlalchemy import create_engine, text
from app.config import settings

def consolidate():
    e = create_engine(settings.DATABASE_URL)
    with e.connect() as conn:
        # 1. Fetch all profiles and steps
        profiles = conn.execute(text('SELECT profile_name, workflow_category, workflow_type, description FROM workflow_profiles WHERE is_deleted = 0')).fetchall()
        steps_rows = conn.execute(text('SELECT profile_name, stage_number, step_name, approver_target, approver_type FROM workflow_step_definitions ORDER BY profile_name, stage_number')).fetchall()

        steps_by_wf = defaultdict(list)
        for p, stage, sname, atarget, atype in steps_rows:
            steps_by_wf[p].append((stage, sname, (atarget or '').strip(), (atype or '').strip()))

        # Group by (category, steps_signature)
        sig_to_wfs = defaultdict(list)
        for p in profiles:
            pname = p[0]
            cat = p[1] or ''
            sig = (cat, tuple(steps_by_wf.get(pname, [])))
            sig_to_wfs[sig].append(pname)

        print(f"Initial workflow profiles: {len(profiles)}")
        print(f"Unique workflow signatures: {len(sig_to_wfs)}")

        remapped = {} # old_name -> master_name
        to_delete = []

        for (cat, steps_sig), wfs in sig_to_wfs.items():
            if len(wfs) > 1:
                # Pick cleanest master name
                sorted_wfs = sorted(wfs, key=lambda x: (len(x), x))
                non_new = [w for w in sorted_wfs if '_NEW' not in w]
                master = non_new[0] if non_new else sorted_wfs[0]

                for old in wfs:
                    if old != master:
                        remapped[old] = master
                        to_delete.append(old)

        print(f"Workflows to merge: {len(remapped)} duplicate profiles into {len(sig_to_wfs)} master profiles")

        # Execute consolidation inside transaction
        for old, master in remapped.items():
            conn.execute(text("UPDATE business_rules SET target_workflow_id = :master WHERE target_workflow_id = :old"), {"master": master, "old": old})
            conn.execute(text("UPDATE documents SET workflow_profile_id = :master WHERE workflow_profile_id = :old"), {"master": master, "old": old})
            conn.execute(text("UPDATE checklist_templates SET workflow_profile = :master WHERE workflow_profile = :old"), {"master": master, "old": old})

        for old in to_delete:
            conn.execute(text("DELETE FROM workflow_step_definitions WHERE profile_name = :old"), {"old": old})
            conn.execute(text("DELETE FROM workflow_profiles WHERE profile_name = :old"), {"old": old})

        conn.commit()

        remaining_profiles = conn.execute(text("SELECT COUNT(*) FROM workflow_profiles")).scalar()
        remaining_steps = conn.execute(text("SELECT COUNT(*) FROM workflow_step_definitions")).scalar()
        remaining_rules = conn.execute(text("SELECT COUNT(*) FROM business_rules")).scalar()
        print(f"\n[SUCCESS] Consolidation complete!")
        print(f"  - Active Workflow Profiles : {remaining_profiles}")
        print(f"  - Workflow Step Definitions: {remaining_steps}")
        print(f"  - Routing Rules in Matrix  : {remaining_rules}")

if __name__ == "__main__":
    consolidate()
