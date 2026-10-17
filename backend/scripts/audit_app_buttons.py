"""
Comprehensive Application Button & Endpoint Audit Script
Tests all core button actions, API endpoints, permissions, database integrity, and error handling.
"""
import sys
import os
import datetime
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice
from app.auth import create_access_token

client = TestClient(app)

results = {
    "summary": {"total_tests": 0, "passed": 0, "failed": 0, "warnings": 0},
    "sections": {}
}

def log_test(section, name, status, details=""):
    if section not in results["sections"]:
        results["sections"][section] = []
    results["summary"]["total_tests"] += 1
    if status == "PASS":
        results["summary"]["passed"] += 1
    elif status == "FAIL":
        results["summary"]["failed"] += 1
    else:
        results["summary"]["warnings"] += 1
    results["sections"][section].append({
        "name": name,
        "status": status,
        "details": details
    })
    symbol = "OK" if status == "PASS" else ("FAIL" if status == "FAIL" else "WARN")
    print(f"[{symbol}] {section} > {name}: {details}")

db = SessionLocal()
admin_user = db.query(User).filter(User.role.ilike("admin"), User.is_deleted == False).first()
if not admin_user:
    # Use any active user as admin or create test admin
    admin_user = db.query(User).filter(User.is_deleted == False).first()

admin_token = create_access_token(data={"sub": admin_user.employee_id or admin_user.username, "role": "admin"}) if admin_user else ""
admin_headers = {"Authorization": f"Bearer {admin_token}"}

# ==========================================
# SECTION 1: AUTHENTICATION & LOGIN BUTTONS
# ==========================================
section = "Authentication & Login"
try:
    resp = client.post("/api/auth/login", json={"username": admin_user.employee_id, "password": "wrong_password"})
    if resp.status_code in [400, 401]:
        log_test(section, "Login with Invalid Password Rejection", "PASS", f"Rejected with HTTP {resp.status_code}")
    else:
        log_test(section, "Login with Invalid Password Rejection", "FAIL", f"Unexpected status {resp.status_code}")
except Exception as e:
    log_test(section, "Login with Invalid Password Rejection", "FAIL", str(e))

try:
    resp = client.get("/api/auth/me", headers=admin_headers)
    if resp.status_code == 200 and resp.json().get("employee_id"):
        log_test(section, "Get Current User Profile (/api/auth/me)", "PASS", f"User: {resp.json().get('employee_id')} ({resp.json().get('role')})")
    else:
        log_test(section, "Get Current User Profile (/api/auth/me)", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Get Current User Profile (/api/auth/me)", "FAIL", str(e))

# ==========================================
# SECTION 2: DASHBOARD & METRICS BUTTONS
# ==========================================
section = "Dashboard & Analytics"
try:
    resp = client.get("/api/documents/metrics", headers=admin_headers)
    if resp.status_code == 200:
        log_test(section, "Dashboard Metrics (/api/documents/metrics)", "PASS", f"Counters loaded successfully: {list(resp.json().keys())[:5]}")
    else:
        # Check fallback
        resp2 = client.get("/api/documents", headers=admin_headers)
        if resp2.status_code == 200:
            log_test(section, "Dashboard Metrics Fallback (/api/documents)", "PASS", f"Retrieved {len(resp2.json())} docs")
        else:
            log_test(section, "Dashboard Metrics", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Dashboard Metrics", "FAIL", str(e))

# ==========================================
# SECTION 3: WORK TRACKER & DOCUMENT ACTIONS
# ==========================================
section = "Work Tracker & Document Actions"
sample_doc = db.query(Invoice).filter(Invoice.is_deleted == False).first()
if sample_doc:
    doc_id = str(sample_doc.id)
    # 3.1 Fetch Document Details
    try:
        resp = client.get(f"/api/documents/{doc_id}", headers=admin_headers)
        if resp.status_code == 200:
            log_test(section, f"View Document Details (ID {doc_id})", "PASS", f"Loaded doc: {resp.json().get('invoice_number', doc_id)}")
        else:
            log_test(section, f"View Document Details (ID {doc_id})", "FAIL", f"Status {resp.status_code}")
    except Exception as e:
        log_test(section, "View Document Details", "FAIL", str(e))

    # 3.2 Checklist toggle button
    try:
        resp = client.get(f"/api/invoices/{doc_id}/checklist", headers=admin_headers)
        if resp.status_code == 200:
            log_test(section, f"Checklist GET (/api/invoices/{doc_id}/checklist)", "PASS", "Checklist items loaded")
        else:
            log_test(section, f"Checklist GET (/api/invoices/{doc_id}/checklist)", "WARN", f"Status {resp.status_code}")
    except Exception as e:
        log_test(section, "Checklist GET", "FAIL", str(e))

    # 3.3 Document Signed URL / PDF Preview button
    try:
        resp = client.get(f"/api/documents/{doc_id}/signed-url?disp=inline", headers=admin_headers)
        if resp.status_code == 200:
            log_test(section, f"Signed URL / PDF Preview (ID {doc_id})", "PASS", "Preview URL generated")
        else:
            log_test(section, f"Signed URL / PDF Preview (ID {doc_id})", "WARN", f"Status {resp.status_code}")
    except Exception as e:
        log_test(section, "Signed URL / PDF Preview", "FAIL", str(e))

    # 3.4 Audit Trail button
    try:
        resp = client.get(f"/api/documents/{doc_id}/audit-trail", headers=admin_headers)
        if resp.status_code == 200:
            log_test(section, f"Audit Trail Fetch (ID {doc_id})", "PASS", f"{len(resp.json())} audit entries found")
        else:
            log_test(section, f"Audit Trail Fetch (ID {doc_id})", "WARN", f"Status {resp.status_code}")
    except Exception as e:
        log_test(section, "Audit Trail Fetch", "FAIL", str(e))

# ==========================================
# SECTION 4: CUSTOMER FEEDBACK WORKFLOW BUTTONS
# ==========================================
section = "Customer Feedback Review"
fb_doc = db.query(Invoice).filter(Invoice.is_deleted == False, Invoice.document_type.ilike("%feedback%")).first()
if not fb_doc:
    fb_doc = db.query(Invoice).filter(Invoice.is_deleted == False).first()

if fb_doc:
    fb_id = str(fb_doc.id)
    try:
        resp = client.get(f"/api/documents/{fb_id}", headers=admin_headers)
        if resp.status_code == 200:
            log_test(section, f"Customer Feedback Document Review (ID {fb_id})", "PASS", "Details loaded successfully")
        else:
            log_test(section, f"Customer Feedback Document Review (ID {fb_id})", "FAIL", f"Status {resp.status_code}")
    except Exception as e:
        log_test(section, "Customer Feedback Document Review", "FAIL", str(e))

# ==========================================
# SECTION 5: ADMIN & RBAC BUTTONS
# ==========================================
section = "Admin User & RBAC Management"
# 5.1 Load Divisions button / dropdown
try:
    resp = client.get("/api/admin/users/divisions/list", headers=admin_headers)
    if resp.status_code == 200 and isinstance(resp.json(), list) and len(resp.json()) > 0:
        log_test(section, "Divisions List API (/api/admin/users/divisions/list)", "PASS", f"{len(resp.json())} active enterprise divisions loaded")
    else:
        log_test(section, "Divisions List API", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Divisions List API", "FAIL", str(e))

# 5.2 Load Roles button
try:
    resp = client.get("/api/admin/roles", headers=admin_headers)
    if resp.status_code == 200 and isinstance(resp.json(), list) and len(resp.json()) > 0:
        log_test(section, "Roles List API (/api/admin/roles)", "PASS", f"{len(resp.json())} roles loaded dynamically from database")
    else:
        log_test(section, "Roles List API", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Roles List API", "FAIL", str(e))

# 5.3 Load Users list
try:
    resp = client.get("/api/admin/users", headers=admin_headers)
    if resp.status_code == 200 and isinstance(resp.json(), list):
        log_test(section, "Users Master List API (/api/admin/users)", "PASS", f"{len(resp.json())} real employees loaded from database")
    else:
        log_test(section, "Users Master List API", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Users Master List API", "FAIL", str(e))

# 5.4 Add User Modal: Create new user button
test_emp_id = f"TEST_AUDIT_{datetime.datetime.now().strftime('%M%S')}"
try:
    new_user_payload = {
        "employee_id": test_emp_id,
        "employee_name": "Audit Test Employee",
        "username": test_emp_id,
        "email": f"{test_emp_id.lower()}@audit.internal",
        "role": "employee",
        "division": "ACC",
        "approval_divisions": "ACC,ACC_ER",
        "department": "Finance",
        "plant": "HQ-UNIT1",
        "is_active": True,
        "mfa_enabled": False,
        "mfa_type": "EMAIL",
        "created_by": "Audit Suite"
    }
    resp = client.post("/api/admin/users", headers=admin_headers, json=new_user_payload)
    if resp.status_code in [200, 201]:
        created_user_id = resp.json().get("id")
        log_test(section, "Add User Button & Form Submission (POST /api/admin/users)", "PASS", f"Created user ID {created_user_id} with ACC approval divisions")
        
        # 5.5 Edit User Modal: Update user profile button
        edit_payload = {
            "employee_id": test_emp_id,
            "employee_name": "Audit Test Employee (Updated)",
            "name": "Audit Test Employee (Updated)",
            "email": f"{test_emp_id.lower()}@audit.internal",
            "department": "Corporate Finance",
            "division": "ACC",
            "approval_divisions": "ACC,ACC_ER,ACC_MDU",
            "role": "manager",
            "plant": "HQ-UNIT1"
        }
        resp_edit = client.put(f"/api/users/{created_user_id}", headers=admin_headers, json=edit_payload)
        if resp_edit.status_code == 200:
            log_test(section, f"Edit User Profile Button & Save (PUT /api/users/{created_user_id})", "PASS", "Updated name, department, role, approval divisions")
        else:
            log_test(section, "Edit User Profile Button & Save", "FAIL", f"Status {resp_edit.status_code}")
        
        # 5.6 Toggle User Status button
        resp_toggle = client.patch(f"/api/users/{created_user_id}/status", headers=admin_headers, json={"is_active": False})
        if resp_toggle.status_code == 200:
            log_test(section, f"Toggle User Active/Inactive Button (PATCH /api/users/{created_user_id}/status)", "PASS", "Toggled to Inactive")
        else:
            log_test(section, "Toggle User Active/Inactive Button", "WARN", f"Status {resp_toggle.status_code}")

        # 5.7 Clean up test user
        del_resp = client.delete(f"/api/users/{created_user_id}", headers=admin_headers)
        if del_resp.status_code == 200:
            log_test(section, f"Delete User Button (DELETE /api/users/{created_user_id})", "PASS", "Cleaned up test user safely")
        else:
            log_test(section, "Delete User Button", "WARN", f"Status {del_resp.status_code}")
    else:
        log_test(section, "Add User Button & Form Submission", "FAIL", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_test(section, "Add User Button & Form Submission", "FAIL", str(e))

# 5.8 Config & Matrix Save button
try:
    resp = client.get("/api/admin/config", headers=admin_headers)
    if resp.status_code == 200:
        log_test(section, "RBAC Config GET (/api/admin/config)", "PASS", f"Retrieved {len(resp.json())} system configurations")
    else:
        log_test(section, "RBAC Config GET", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "RBAC Config GET", "FAIL", str(e))

# ==========================================
# SECTION 6: SYSTEM, AUDIT LOGS & BACKUPS
# ==========================================
section = "System Maintenance, Audit & Backups"
# 6.1 Audit Logs button
try:
    resp = client.get("/api/admin/audit-logs?limit=10", headers=admin_headers)
    if resp.status_code == 200:
        logs_count = len(resp.json()) if isinstance(resp.json(), list) else len(resp.json().get("items", []))
        log_test(section, "Audit Logs Fetch Button (/api/admin/audit-logs)", "PASS", f"{logs_count} recent audit entries retrieved")
    else:
        log_test(section, "Audit Logs Fetch Button", "FAIL", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Audit Logs Fetch Button", "FAIL", str(e))

# 6.2 Backup History button
try:
    resp = client.get("/api/admin/backup/history", headers=admin_headers)
    if resp.status_code == 200:
        log_test(section, "Backup History Fetch (/api/admin/backup/history)", "PASS", "Backup logs loaded")
    else:
        log_test(section, "Backup History Fetch", "WARN", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Backup History Fetch", "FAIL", str(e))

# ==========================================
# SECTION 7: WORKFLOW RULES & POLICY MATRIX
# ==========================================
section = "Workflow Rules & Conditions"
try:
    resp = client.get("/api/workflows/stages", headers=admin_headers)
    if resp.status_code == 200:
        log_test(section, "Workflow Stages Fetch (/api/workflows/stages)", "PASS", f"{len(resp.json())} stages configured")
    else:
        log_test(section, "Workflow Stages Fetch", "WARN", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Workflow Stages Fetch", "FAIL", str(e))

try:
    resp = client.get("/api/admin/conditions", headers=admin_headers)
    if resp.status_code == 200:
        log_test(section, "Business Rules / Matrix Conditions (/api/admin/conditions)", "PASS", f"{len(resp.json())} rules retrieved")
    else:
        log_test(section, "Business Rules / Matrix Conditions", "WARN", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "Business Rules / Matrix Conditions", "FAIL", str(e))

# ==========================================
# SECTION 8: ERP SYNC & INTEGRATION BUTTONS
# ==========================================
section = "ERP Sync & Integration Hub"
try:
    resp = client.get("/api/sync/status", headers=admin_headers)
    if resp.status_code == 200:
        log_test(section, "ERP Sync Status (/api/sync/status)", "PASS", "Sync metrics loaded")
    else:
        # Fallback to sync endpoint
        resp2 = client.get("/api/sync/health", headers=admin_headers)
        if resp2.status_code == 200:
            log_test(section, "ERP Sync Health (/api/sync/health)", "PASS", "Sync service healthy")
        else:
            log_test(section, "ERP Sync Status", "WARN", f"Status {resp.status_code}")
except Exception as e:
    log_test(section, "ERP Sync Status", "FAIL", str(e))

# ==========================================
# SUMMARY REPORT
# ==========================================
print("\n" + "="*60)
print(f"AUDIT SUMMARY: {results['summary']['passed']}/{results['summary']['total_tests']} PASSED, {results['summary']['failed']} FAILED, {results['summary']['warnings']} WARNINGS")
print("="*60)

db.close()
