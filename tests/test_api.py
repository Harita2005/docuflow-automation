from fastapi.testclient import TestClient


class TestHealthAndSystemEndpoints:
    def test_health_check_returns_200(self, client: TestClient):
        """Verify the root health endpoint returns healthy status and service version."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        assert "service" in data
        assert "version" in data


class TestAuthenticationEndpoints:
    def test_get_current_user_unauthorized(self, client: TestClient):
        """Accessing /api/auth/me without authorization header must return 401."""
        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_get_current_user_authorized(self, client: TestClient, auth_tokens):
        """Accessing /api/auth/me with valid Bearer token returns user profile."""
        response = client.get("/api/auth/me", headers=auth_tokens["admin_headers"])
        assert response.status_code == 200
        data = response.json()
        assert "username" in data
        assert "role" in data

    def test_login_invalid_credentials(self, client: TestClient):
        """Login with wrong password must return 401 Unauthorized."""
        response = client.post(
            "/api/auth/login",
            json={"username": "non_existent_user_9999", "password": "wrongpassword123"}
        )
        assert response.status_code == 401

    def test_login_missing_required_fields(self, client: TestClient):
        """Login with missing fields must return 422 Unprocessable Entity."""
        response = client.post("/api/auth/login", json={})
        assert response.status_code == 422


class TestDocumentEndpoints:
    def test_get_invoices_unauthorized(self, client: TestClient):
        """Accessing invoice queue without authentication must return 401."""
        response = client.get("/api/invoices")
        assert response.status_code == 401

    def test_get_invoices_authorized(self, client: TestClient, auth_tokens):
        """Admin can retrieve invoice queue."""
        response = client.get("/api/invoices", headers=auth_tokens["admin_headers"])
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_invoices_with_status_filter(self, client: TestClient, auth_tokens):
        """Filtering invoices by status parameter returns matching list."""
        response = client.get("/api/invoices?status=Pending%20Approval", headers=auth_tokens["admin_headers"])
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_invoice_detail_not_found(self, client: TestClient, auth_tokens):
        """Querying a non-existent document ID must return 404."""
        response = client.get("/api/invoices/NON_EXISTENT_ID_99999", headers=auth_tokens["admin_headers"])
        assert response.status_code == 404

    def test_get_more_info_config_for_doctype(self, client: TestClient, auth_tokens):
        """Verify dynamic more-info field configuration returns selected and available fields."""
        response = client.get(
            "/api/document-types/AP%20INVOICE/more-info/config",
            headers=auth_tokens["admin_headers"]
        )
        assert response.status_code == 200
        data = response.json()
        assert "document_type" in data
        assert "selected_fields" in data
        assert "available_fields" in data
        assert isinstance(data["selected_fields"], list)
        assert len(data["selected_fields"]) >= 3


class TestAdminRBACEndpoints:
    def test_admin_roles_endpoint_accessible_by_admin(self, client: TestClient, auth_tokens):
        """Admin user can list system roles."""
        response = client.get("/api/admin/roles", headers=auth_tokens["admin_headers"])
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_create_role_forbidden_for_employee(self, client: TestClient, auth_tokens):
        """Regular employee must be forbidden (403) from creating new roles."""
        response = client.post(
            "/api/admin/roles",
            json={"code": "unauthorized_role_test", "name": "Unauthorized Test Role"},
            headers=auth_tokens["employee_headers"]
        )
        assert response.status_code == 403

    def test_admin_permissions_endpoint_accessible_by_admin(self, client: TestClient, auth_tokens):
        """Admin user can retrieve all system permissions."""
        response = client.get("/api/admin/permissions", headers=auth_tokens["admin_headers"])
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0


class TestWorkflowAndIntegrationEndpoints:
    def test_get_workflows_accessible_by_admin(self, client: TestClient, auth_tokens):
        """Admin user can list workflow definitions."""
        response = client.get("/api/workflows", headers=auth_tokens["admin_headers"])
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_integrations_v2_applications(self, client: TestClient, auth_tokens):
        """Admin user can query integration applications studio."""
        response = client.get(
            "/api/integrations/v2/applications",
            headers=auth_tokens["admin_headers"]
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert isinstance(data.get("data"), list)
