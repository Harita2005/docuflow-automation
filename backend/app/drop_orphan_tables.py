"""
One-time idempotent cleanup: drops orphan old tables and all wf_* tables.
Called from main.py before Base.metadata.create_all().
Safe to run repeatedly — uses IF EXISTS / OBJECT_ID guards.
"""
from sqlalchemy import text

# Tables to drop in dependency order (children before parents)
_TABLES = [
    # wf_* leaf tables first
    "wf_execution_checklist",
    "wf_match_log",
    "wf_execution",
    "wf_execution_input",
    "wf_checklist_item",
    "wf_checklist_stage",
    "wf_checklist_template",
    "wf_rule_condition_value",
    "wf_rule_condition",
    "wf_rule",
    "wf_workflow"
]


def run(engine) -> None:
    db_url = str(engine.url)
    is_sqlite = db_url.startswith("sqlite")

    with engine.connect() as conn:
        for table in _TABLES:
            try:
                if is_sqlite:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table};"))
                else:
                    conn.execute(text(
                        f"IF OBJECT_ID('{table}', 'U') IS NOT NULL DROP TABLE {table};"
                    ))
                conn.commit()
            except Exception as e:
                print(f"[drop_orphan_tables] Could not drop {table}: {e}")

    print("[drop_orphan_tables] Cleanup complete.")
