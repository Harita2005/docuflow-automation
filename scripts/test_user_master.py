import requests

BASE = "http://127.0.0.1:8000/api"

def test_user_master_and_builders():
    print(">>> Testing User Master Management API...")
    
    # 1. Fetch Users
    r = requests.get(f"{BASE}/users")
    users = r.json()
    print("Total Users in Master:", len(users))
    sample = users[0]
    print("Sample User Master Record:", {
        "user_uid": sample.get("user_uid"),
        "employee_id": sample.get("employee_id"),
        "employee_name": sample.get("employee_name"),
        "role": sample.get("role"),
        "is_active": sample.get("is_active"),
        "mfa_enabled": sample.get("mfa_enabled"),
        "mfa_type": sample.get("mfa_type"),
        "created_by": sample.get("created_by")
    })
    assert sample.get("user_uid") is not None, "Missing user_uid"
    assert sample.get("employee_id") is not None, "Missing employee_id"

    # 2. Create New Employee in User Master
    print("\n>>> Creating New Employee in User Master...")
    new_user_payload = {
        "employee_id": "EMP-99214",
        "employee_name": "Suresh Kumar",
        "email": "suresh.kumar@docuflow.net",
        "phone_number": "+91 98421 55678",
        "password": "SecurePassword@2026",
        "role": "manager",
        "division": "VCC",
        "plant": "TN-SIVAKASI",
        "is_active": True,
        "mfa_enabled": True,
        "mfa_type": "SMS",
        "created_by": "System Admin"
    }
    r_create = requests.post(f"{BASE}/users", json=new_user_payload)
    created = r_create.json()
    print("Created User Master Result:", {
        "id": created.get("id"),
        "user_uid": created.get("user_uid"),
        "employee_id": created.get("employee_id"),
        "name": created.get("employee_name"),
        "is_active": created.get("is_active"),
        "mfa_enabled": created.get("mfa_enabled")
    })
    assert r_create.status_code == 201, f"Failed creating user: {r_create.text}"

    # 3. Test Status Toggle (Deactivate / Activate Employee)
    print("\n>>> Testing Status Toggle (Deactivate Employee)...")
    r_deact = requests.patch(f"{BASE}/users/{created['id']}/status", json={"is_active": False})
    deact_res = r_deact.json()
    print("Deactivated Status:", deact_res.get("is_active"))
    assert deact_res.get("is_active") is False, "Status deactivation failed"

    print(">>> Re-activating Employee...")
    r_act = requests.patch(f"{BASE}/users/{created['id']}/status", json={"is_active": True})
    act_res = r_act.json()
    print("Re-activated Status:", act_res.get("is_active"))
    assert act_res.get("is_active") is True, "Status re-activation failed"

    # 4. Verify Flow Builder & Condition Builder Persistence
    print("\n>>> Testing Workflow Builder Table Insertion...")
    wf_payload = {
        "profile_name": "CUSTOM_SIVAKASI_URGENT_FLOW",
        "workflow_code": "VCC-SVK-URG",
        "workflow_category": "Regional FastTrack",
        "workflow_type": "AP INVOICE",
        "description": "Custom emergency expedited workflow created via UI",
        "status": "Active",
        "steps": [
            {
                "stage_number": 1,
                "step_name": "BRANCH MANAGER FAST-TRACK",
                "approver_type": "Approval Pool",
                "approver_target": "SIBITHA, VIVEK_00336",
                "action_required": "Expedited Approve",
                "sla_hours": 12
            }
        ]
    }
    r_wf = requests.post(f"{BASE}/admin/workflows/save", json=wf_payload)
    print("Workflow Save Response:", r_wf.json())
    assert r_wf.status_code == 200, "Workflow save failed"

    print("\n>>> Testing Condition Builder Table Insertion...")
    rule_payload = {
        "rule_name": "Rule: Urgent Sivakasi FastTrack",
        "rule_category": "Regional FastTrack",
        "document_type": "AP INVOICE",
        "priority": 1,
        "target_workflow_id": "CUSTOM_SIVAKASI_URGENT_FLOW",
        "conditions_json": '[{"field": "Branch", "operator": "equals", "value": "TN-SIVAKASI", "logicalOperator": "AND"}]',
        "description": "Auto-routes Sivakasi urgent bills",
        "is_active": True
    }
    r_rule = requests.post(f"{BASE}/admin/conditions/save", json=rule_payload)
    print("Condition Rule Save Response:", r_rule.json())
    assert r_rule.status_code == 200, "Condition save failed"

    print("\n========================================================")
    print(">>> USER MASTER & BUILDER PERSISTENCE TESTS PASSED 100%!")
    print("========================================================")

if __name__ == "__main__":
    test_user_master_and_builders()
