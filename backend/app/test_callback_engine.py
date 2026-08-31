import unittest
import json
from app.services.callback_service import (
    resolve_dynamic_variables,
    evaluate_rule_conditions,
    validate_url_ssrf,
    mask_sensitive_headers,
    build_auth_headers,
    build_callback_request,
    build_document_context
)
from app.models import Document, ThirdPartyApplication, CallbackRule

class TestCallbackEngine(unittest.TestCase):
    def test_resolve_dynamic_variables(self):
        ctx = {
            "primaryKey": "84932",
            "documentNumber": "INV-1024",
            "approvalStatus": "APPROVED",
            "company": "VCC"
        }
        url_template = "/api/v1/payment/{{documentNumber}}/approval?pk={{primaryKey}}&status={{approvalStatus}}"
        resolved = resolve_dynamic_variables(url_template, ctx)
        self.assertEqual(resolved, "/api/v1/payment/INV-1024/approval?pk=84932&status=APPROVED")

    def test_evaluate_conditions_and_or(self):
        ctx = {
            "company": "VCC",
            "documentType": "AP INVOICE",
            "amount": 150000.0,
            "fdoDecision": "APPROVED"
        }
        
        # 1. Single condition (Equals)
        cond1 = [{"field": "company", "operator": "Equals", "value": "VCC"}]
        self.assertTrue(evaluate_rule_conditions(json.dumps(cond1), ctx))

        # 2. Condition fails
        cond2 = [{"field": "company", "operator": "Equals", "value": "OTHER"}]
        self.assertFalse(evaluate_rule_conditions(json.dumps(cond2), ctx))

        # 3. AND grouping
        cond_and = {
            "logicalOperator": "AND",
            "conditions": [
                {"field": "company", "operator": "Equals", "value": "VCC"},
                {"field": "amount", "operator": "Greater Than", "value": "100000"}
            ]
        }
        self.assertTrue(evaluate_rule_conditions(json.dumps(cond_and), ctx))

        # 4. OR grouping
        cond_or = {
            "logicalOperator": "OR",
            "conditions": [
                {"field": "company", "operator": "Equals", "value": "XYZ"},
                {"field": "fdoDecision", "operator": "In", "value": "APPROVED,REJECTED"}
            ]
        }
        self.assertTrue(evaluate_rule_conditions(json.dumps(cond_or), ctx))

    def test_validate_url_ssrf(self):
        # Valid HTTP/HTTPS
        validate_url_ssrf("https://payment.example.com/api/v1/approval")
        validate_url_ssrf("http://192.168.1.50:8080/webhook")

        # Invalid scheme
        with self.assertRaises(ValueError):
            validate_url_ssrf("file:///etc/passwd")

        with self.assertRaises(ValueError):
            validate_url_ssrf("ftp://internal-server/data")

    def test_mask_sensitive_headers(self):
        hdrs = {
            "Content-Type": "application/json",
            "Authorization": "Bearer secret_token_123",
            "X-API-Key": "super_secret_key"
        }
        masked = mask_sensitive_headers(hdrs)
        self.assertEqual(masked["Content-Type"], "application/json")
        self.assertNotIn("secret_token_123", masked["Authorization"])
        self.assertNotIn("super_secret_key", masked["X-API-Key"])
        self.assertIn("••••••••••••", masked["X-API-Key"])

    def test_build_auth_headers(self):
        # API Key
        api_key_hdrs = build_auth_headers("API_KEY", json.dumps({"header_name": "X-API-Key", "api_key": "my_key_123"}))
        self.assertEqual(api_key_hdrs.get("X-API-Key"), "my_key_123")

        # Bearer Token
        bearer_hdrs = build_auth_headers("BEARER_TOKEN", json.dumps({"token": "my_bearer_token"}))
        self.assertEqual(bearer_hdrs.get("Authorization"), "Bearer my_bearer_token")

        # Basic Auth
        basic_hdrs = build_auth_headers("BASIC_AUTH", json.dumps({"username": "admin", "password": "secretpassword"}))
        self.assertTrue(basic_hdrs.get("Authorization").startswith("Basic "))

    def test_build_callback_request(self):
        app = ThirdPartyApplication(
            name="Payment Application",
            code="PAYMENT_APP",
            base_url="https://payment.example.com/api",
            auth_type="API_KEY",
            auth_config_json=json.dumps({"header_name": "X-API-Key", "api_key": "sec_123"})
        )

        rule = CallbackRule(
            rule_name="Payment Callback Rule",
            application_id=1,
            http_method="POST",
            url_mode="INHERIT_BASE",
            endpoint_path="/v1/payment/{{documentNumber}}/approval",
            body_type="JSON",
            payload_mapping_json=json.dumps([
                {"thirdPartyField": "record_id", "sourceField": "primaryKey"},
                {"thirdPartyField": "invoice_no", "sourceField": "documentNumber"},
                {"thirdPartyField": "fdo_status", "sourceField": "approvalStatus"}
            ])
        )

        ctx = {
            "primaryKey": "84932",
            "documentNumber": "INV-1024",
            "approvalStatus": "APPROVED",
            "eventId": "EVT-1001"
        }

        method, final_url, final_headers, body_bytes = build_callback_request(rule, app, ctx)

        self.assertEqual(method, "POST")
        self.assertEqual(final_url, "https://payment.example.com/api/v1/payment/INV-1024/approval")
        self.assertEqual(final_headers.get("X-API-Key"), "sec_123")
        self.assertEqual(final_headers.get("X-Approval-Event-ID"), "EVT-1001")
        self.assertEqual(final_headers.get("Content-Type"), "application/json")
        
        payload = json.loads(body_bytes.decode("utf-8"))
        self.assertEqual(payload["record_id"], "84932")
        self.assertEqual(payload["invoice_no"], "INV-1024")
        self.assertEqual(payload["fdo_status"], "APPROVED")

if __name__ == "__main__":
    unittest.main()


def test_resolve_dynamic_variables():
    ctx = {
        "primaryKey": "84932",
        "documentNumber": "INV-1024",
        "approvalStatus": "APPROVED",
        "company": "VCC"
    }
    url_template = "/api/v1/payment/{{documentNumber}}/approval?pk={{primaryKey}}&status={{approvalStatus}}"
    resolved = resolve_dynamic_variables(url_template, ctx)
    assert resolved == "/api/v1/payment/INV-1024/approval?pk=84932&status=APPROVED"

def test_evaluate_conditions_and_or():
    ctx = {
        "company": "VCC",
        "documentType": "AP INVOICE",
        "amount": 150000.0,
        "fdoDecision": "APPROVED"
    }
    
    # 1. Single condition (Equals)
    cond1 = [{"field": "company", "operator": "Equals", "value": "VCC"}]
    assert evaluate_rule_conditions(json.dumps(cond1), ctx) == True

    # 2. Condition fails
    cond2 = [{"field": "company", "operator": "Equals", "value": "OTHER"}]
    assert evaluate_rule_conditions(json.dumps(cond2), ctx) == False

    # 3. AND grouping
    cond_and = {
        "logicalOperator": "AND",
        "conditions": [
            {"field": "company", "operator": "Equals", "value": "VCC"},
            {"field": "amount", "operator": "Greater Than", "value": "100000"}
        ]
    }
    assert evaluate_rule_conditions(json.dumps(cond_and), ctx) == True

    # 4. OR grouping
    cond_or = {
        "logicalOperator": "OR",
        "conditions": [
            {"field": "company", "operator": "Equals", "value": "XYZ"},
            {"field": "fdoDecision", "operator": "In", "value": "APPROVED,REJECTED"}
        ]
    }
    assert evaluate_rule_conditions(json.dumps(cond_or), ctx) == True

def test_validate_url_ssrf():
    # Valid HTTP/HTTPS
    validate_url_ssrf("https://payment.example.com/api/v1/approval")
    validate_url_ssrf("http://192.168.1.50:8080/webhook")

    # Invalid scheme
    with pytest.raises(ValueError):
        validate_url_ssrf("file:///etc/passwd")

    with pytest.raises(ValueError):
        validate_url_ssrf("ftp://internal-server/data")

def test_mask_sensitive_headers():
    hdrs = {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret_token_123",
        "X-API-Key": "super_secret_key"
    }
    masked = mask_sensitive_headers(hdrs)
    assert masked["Content-Type"] == "application/json"
    assert "secret_token_123" not in masked["Authorization"]
    assert "super_secret_key" not in masked["X-API-Key"]
    assert "••••••••••••" in masked["X-API-Key"]

def test_build_auth_headers():
    # API Key
    api_key_hdrs = build_auth_headers("API_KEY", json.dumps({"header_name": "X-API-Key", "api_key": "my_key_123"}))
    assert api_key_hdrs.get("X-API-Key") == "my_key_123"

    # Bearer Token
    bearer_hdrs = build_auth_headers("BEARER_TOKEN", json.dumps({"token": "my_bearer_token"}))
    assert bearer_hdrs.get("Authorization") == "Bearer my_bearer_token"

    # Basic Auth
    basic_hdrs = build_auth_headers("BASIC_AUTH", json.dumps({"username": "admin", "password": "secretpassword"}))
    assert basic_hdrs.get("Authorization").startswith("Basic ")

def test_build_callback_request():
    app = ThirdPartyApplication(
        name="Payment Application",
        code="PAYMENT_APP",
        base_url="https://payment.example.com/api",
        auth_type="API_KEY",
        auth_config_json=json.dumps({"header_name": "X-API-Key", "api_key": "sec_123"})
    )

    rule = CallbackRule(
        rule_name="Payment Callback Rule",
        application_id=1,
        http_method="POST",
        url_mode="INHERIT_BASE",
        endpoint_path="/v1/payment/{{documentNumber}}/approval",
        body_type="JSON",
        payload_mapping_json=json.dumps([
            {"thirdPartyField": "record_id", "sourceField": "primaryKey"},
            {"thirdPartyField": "invoice_no", "sourceField": "documentNumber"},
            {"thirdPartyField": "fdo_status", "sourceField": "approvalStatus"}
        ])
    )

    ctx = {
        "primaryKey": "84932",
        "documentNumber": "INV-1024",
        "approvalStatus": "APPROVED",
        "eventId": "EVT-1001"
    }

    method, final_url, final_headers, body_bytes = build_callback_request(rule, app, ctx)

    assert method == "POST"
    assert final_url == "https://payment.example.com/api/v1/payment/INV-1024/approval"
    assert final_headers.get("X-API-Key") == "sec_123"
    assert final_headers.get("X-Approval-Event-ID") == "EVT-1001"
    assert final_headers.get("Content-Type") == "application/json"
    
    payload = json.loads(body_bytes.decode("utf-8"))
    assert payload["record_id"] == "84932"
    assert payload["invoice_no"] == "INV-1024"
    assert payload["fdo_status"] == "APPROVED"
