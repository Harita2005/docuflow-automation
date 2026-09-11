import pyodbc

def update_approvers():
    conn = pyodbc.connect(
        'DRIVER={ODBC Driver 17 for SQL Server};'
        'SERVER=127.0.0.1,1433;'
        'DATABASE=DocuFlowDB;'
        'Trusted_Connection=yes;'
    )
    cur = conn.cursor()
    try:
        cur.execute("UPDATE workflow_step_definitions SET approver_target='YUVASREE', approver_type='Specific Employee' WHERE stage_number=1")
        s1 = cur.rowcount
        cur.execute("UPDATE workflow_step_definitions SET approver_target='Nattudurai', approver_type='Specific Employee' WHERE stage_number=2")
        s2 = cur.rowcount
        cur.execute("UPDATE workflow_step_definitions SET approver_target='VIGNESH', approver_type='Specific Employee' WHERE stage_number=3")
        s3 = cur.rowcount
        cur.execute("UPDATE workflow_step_definitions SET approver_target='VARUNAN', approver_type='Specific Employee' WHERE stage_number>=4")
        s4 = cur.rowcount

        # Also update active documents to point to the designated stage approver
        cur.execute("UPDATE documents SET assigned_approver='YUVASREE' WHERE current_stage=1 AND status NOT IN ('Approved', 'Settled', 'Paid', 'Cancelled')")
        cur.execute("UPDATE documents SET assigned_approver='Nattudurai' WHERE current_stage=2 AND status NOT IN ('Approved', 'Settled', 'Paid', 'Cancelled')")
        cur.execute("UPDATE documents SET assigned_approver='VIGNESH' WHERE current_stage=3 AND status NOT IN ('Approved', 'Settled', 'Paid', 'Cancelled')")
        cur.execute("UPDATE documents SET assigned_approver='VARUNAN' WHERE current_stage>=4 AND status NOT IN ('Approved', 'Settled', 'Paid', 'Cancelled')")

        conn.commit()
        print(f"[SUCCESS] Updated {s1} Stage 1 steps (YUVASREE), {s2} Stage 2 steps (Nattudurai), {s3} Stage 3 steps (VIGNESH), {s4} Stage 4+ steps (VARUNAN).")
    finally:
        conn.close()

if __name__ == '__main__':
    update_approvers()