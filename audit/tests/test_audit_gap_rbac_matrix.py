"""
Security Test Suite: RBAC Matrix and Route Protection Verification
Security Findings: SEC-04 (Route Protection) and GAP-05 (RBAC Enforcement)

Validates:
1. Deny-by-default route guard: No non-whitelisted route may be exposed without authentication.
2. RBAC Access Matrix: Tests endpoints across 5 roles (Admin, Approver, Employee, Auditor, Anonymous)
   to ensure proper least-privilege role boundaries and prevent privilege escalation.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token
from app.database.connection import SessionLocal
from app.database.models import User

client = TestClient(app)

# Whitelist of intentionally public routes
PUBLIC_ROUTES_WHITELIST = {
    "/",
    "/api/health",
    "/health",
    "/api/auth/login",
    "/api/auth/token",
    "/m2m/auth/login",
    "/api/auth/mfa/send-otp",
    "/api/auth/mfa/setup-totp",
    "/api/auth/mfa/verify",
    "/api/files/signed/{document_id}",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
    "/api/openapi.json",
}


def test_deny_by_default_all_routes_require_authentication_or_whitelist():
    """
    SEC-04 Automated Guard:
    Scans every mounted route in the FastAPI application.
    Fails immediately if any non-whitelisted route does not include an authentication/service-key dependency.
    """
    unprotected_routes = []

    for route in app.routes:
        if not hasattr(route, "methods"):
            continue
        path = route.path
        if path in PUBLIC_ROUTES_WHITELIST:
            continue

        deps = []
        if hasattr(route, "dependant"):
            for d in (route.dependant.dependencies or []):
                if hasattr(d, "call"):
                    deps.append(d.call.__name__)

        is_auth_protected = any(
            k in d.lower()
            for d in deps
            for k in [
                "user",
                "auth",
                "key",
                "m2m",
                "admin",
                "callback",
                "perm",
                "webhook",
                "dependency",
            ]
        )

        if not is_auth_protected:
            unprotected_routes.append((list(route.methods), path, deps))

    assert (
        len(unprotected_routes) == 0
    ), f"SEC-04 VIOLATION: Discovered {len(unprotected_routes)} unprotected non-whitelisted routes: {unprotected_routes}"


@pytest.fixture(scope="module")
def role_tokens():
    """Generates valid JWT tokens using real active users for each role."""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        emp = db.query(User).filter(User.username == "YUVASREE").first()
        appr = db.query(User).filter(User.username == "initha").first()
        mgr = db.query(User).filter(User.username == "VIGNESH").first()

        tokens = {
            "Admin": create_access_token(
                {"sub": admin.username, "role": admin.role, "employee_id": admin.employee_id}
            ) if admin else None,
            "Employee": create_access_token(
                {"sub": emp.username, "role": emp.role, "employee_id": emp.employee_id}
            ) if emp else None,
            "Approver": create_access_token(
                {"sub": appr.username, "role": appr.role, "employee_id": appr.employee_id}
            ) if appr else None,
            "Auditor": create_access_token(
                {"sub": mgr.username, "role": mgr.role, "employee_id": mgr.employee_id}
            ) if mgr else None,
            "Anonymous": None,
        }
        return tokens
    finally:
        db.close()


@pytest.mark.parametrize(
    "method,endpoint,role,expected_status",
    [
        # 1. Public Health Check
        ("GET", "/health", "Anonymous", 200),
        ("GET", "/api/health", "Anonymous", 200),

        # 2. Admin Workflows Configuration (Protected: Admin Only)
        ("GET", "/api/admin/workflows", "Anonymous", 401),
        ("GET", "/api/admin/workflows", "Employee", 403),
        ("GET", "/api/admin/workflows", "Approver", 403),
        ("GET", "/api/admin/workflows", "Auditor", 403),
        ("GET", "/api/admin/workflows", "Admin", 200),

        # 3. Admin Conditions Configuration (Protected: Admin Only)
        ("GET", "/api/admin/conditions", "Anonymous", 401),
        ("GET", "/api/admin/conditions", "Employee", 403),
        ("GET", "/api/admin/conditions", "Approver", 403),
        ("GET", "/api/admin/conditions", "Auditor", 403),
        ("GET", "/api/admin/conditions", "Admin", 200),

        # 4. Callback Integrations Management (Protected: Callback Admin Only)
        ("GET", "/api/integrations/v2/applications", "Anonymous", 401),
        ("GET", "/api/integrations/v2/applications", "Employee", 403),
        ("GET", "/api/integrations/v2/applications", "Approver", 403),
        ("GET", "/api/integrations/v2/applications", "Auditor", 403),
        ("GET", "/api/integrations/v2/applications", "Admin", 200),

        # 5. Core Operational Endpoints (Authenticated Users)
        ("GET", "/api/documents", "Anonymous", 401),
        ("GET", "/api/documents", "Employee", 200),
        ("GET", "/api/documents", "Approver", 200),
        ("GET", "/api/documents", "Auditor", 200),
        ("GET", "/api/documents", "Admin", 200),
    ],
)
def test_rbac_access_matrix(method, endpoint, role, expected_status, role_tokens):
    """
    Validates that each role receives exactly the expected status code according to RBAC.
    """
    token = role_tokens.get(role)
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    if method == "GET":
        res = client.get(endpoint, headers=headers)
    elif method == "POST":
        res = client.post(endpoint, headers=headers, json={})
    else:
        pytest.fail(f"Unsupported method {method}")

    assert res.status_code == expected_status, (
        f"RBAC Matrix Mismatch on {method} {endpoint} for role '{role}': "
        f"expected {expected_status}, received {res.status_code}. Response: {res.text}"
    )
