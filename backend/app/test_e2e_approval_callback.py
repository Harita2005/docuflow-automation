import sys
import json
from app.database import SessionLocal, engine, Base
from app.models import Document, ThirdPartyApplication, CallbackRule, CallbackEvent, CallbackAttempt
from app.services.callback_service import dispatch_approval_callback_events

def run_e2e_approval_callback_test():
    print("=" * 70)
    print("STARTING E2E APPROVAL & REJECTION CALLBACK SYNC TEST")
    print("=" * 70)

    # Ensure tables exist in target DB
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Setup Test Application
        app = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.code == "TEST_E2E_APP").first()
        if not app:
            app = ThirdPartyApplication(
                name="Test Payment System",
                code="TEST_E2E_APP",
                description="End to end callback test receiver",
                base_url="https://httpbin.org",  # Public reliable HTTP echo endpoint
                environment="Testing",
                status="Active",
                auth_type="API_KEY",
                auth_config_json=json.dumps({
                    "header_name": "X-Payment-API-Key",
                    "api_key": "e2e_secret_token_12345"
                })
            )
            db.add(app)
            db.commit()
            db.refresh(app)
            print(f"[SUCCESS] Created Target Application: {app.name} (ID: {app.id})")
        else:
            print(f"[EXISTING] Using Target Application: {app.name} (ID: {app.id})")

        # 2. Setup Test Callback Rule
        rule = db.query(CallbackRule).filter(CallbackRule.rule_name == "E2E FDO Callback Rule").first()
        if not rule:
            rule = CallbackRule(
                rule_name="E2E FDO Callback Rule",
                description="Rule for dispatching both APPROVED and REJECTED decisions",
                application_id=app.id,
                status="ACTIVE",
                priority=1,
                trigger_event="FDO_FINAL_DECISION",
                run_when="BOTH",
                conditions_json=json.dumps({"logicalOperator": "AND", "conditions": []}),
                http_method="POST",
                url_mode="INHERIT_BASE",
                endpoint_path="/post",
                body_type="JSON",
                payload_mapping_json=json.dumps([
                    {"thirdPartyField": "transaction_id", "sourceField": "primaryKey"},
                    {"thirdPartyField": "document_number", "sourceField": "documentNumber"},
                    {"thirdPartyField": "fdo_decision", "sourceField": "approvalStatus"},
                    {"thirdPartyField": "company_code", "sourceField": "company"}
                ]),
                timeout_seconds=15,
                success_criteria_json=json.dumps([200, 201, 202, 204]),
                retry_config_json=json.dumps({"mode": "AUTO", "max_attempts": 3, "backoff": "EXPONENTIAL"})
            )
            db.add(rule)
            db.commit()
            db.refresh(rule)
            print(f"[SUCCESS] Created Callback Rule: {rule.rule_name} (ID: {rule.id})")
        else:
            print(f"[EXISTING] Using Callback Rule: {rule.rule_name} (ID: {rule.id})")

        # 3. Create or Fetch Test Document
        doc = db.query(Document).filter(Document.id == "DOC-E2E-90001").first()
        if not doc:
            doc = Document(
                id="DOC-E2E-90001",
                doc_num="DOC-E2E-90001",
                doc_key="PK-E2E-889900",
                document_type="AP INVOICE",
                party_name="VCC Global Ltd",
                vendor_name="VCC Global Ltd",
                amount=250000.0,
                status="Pending Approval",
                division="VCC",
                category="Software",
                plant="HQ-MAIN"
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            print(f"[SUCCESS] Created Test Document: {doc.id}")
        else:
            print(f"[EXISTING] Using Test Document: {doc.id}")

        # -------------------------------------------------------------------
        # TEST STEP A: SIMULATE FDO APPROVAL DECISION
        # -------------------------------------------------------------------
        print("\n" + "-" * 60)
        print("TEST STEP A: Executing FDO Approval Event ('APPROVED')")
        print("-" * 60)

        events_approved = dispatch_approval_callback_events(db, doc.id, "APPROVED")
        print(f"[DISPATCH] Dispatched {len(events_approved)} callback event(s) for APPROVED decision.")

        assert len(events_approved) > 0, "No callback event dispatched for APPROVED decision!"
        evt_appr = events_approved[0]
        event_id_appr = evt_appr["event_id"]
        print(f"   -> Event ID: {event_id_appr}")
        print(f"   -> Target Application: {evt_appr['application']}")
        print(f"   -> Rule Name: {evt_appr['rule']}")
        print(f"   -> Result: {evt_appr['result']}")

        # Fetch attempt details
        evt_obj_appr = db.query(CallbackEvent).filter(CallbackEvent.event_id == event_id_appr).first()
        assert evt_obj_appr is not None
        attempts_appr = db.query(CallbackAttempt).filter(CallbackAttempt.callback_event_id == evt_obj_appr.id).all()
        assert len(attempts_appr) > 0, "No attempts recorded for approved callback event!"
        att_appr = attempts_appr[0]
        print(f"   -> Request Method: {att_appr.http_method}")
        print(f"   -> Request URL: {att_appr.request_url}")
        print(f"   -> Response Code: {att_appr.response_status_code}")
        print(f"   -> Response Time: {att_appr.response_time_ms} ms")
        print(f"   -> Request Body:\n{att_appr.request_body}")

        req_payload_appr = json.loads(att_appr.request_body)
        assert req_payload_appr["fdo_decision"] == "APPROVED", "Dynamic variable approvalStatus was not replaced with 'APPROVED'!"
        assert req_payload_appr["document_number"] == "DOC-E2E-90001"
        assert req_payload_appr["transaction_id"] == "PK-E2E-889900"
        print("[VERIFIED] APPROVED decision dynamic variables replaced perfectly!")

        # -------------------------------------------------------------------
        # TEST STEP B: SIMULATE FDO REJECTION DECISION
        # -------------------------------------------------------------------
        print("\n" + "-" * 60)
        print("TEST STEP B: Executing FDO Rejection Event ('REJECTED')")
        print("-" * 60)

        events_rejected = dispatch_approval_callback_events(db, doc.id, "REJECTED")
        print(f"[DISPATCH] Dispatched {len(events_rejected)} callback event(s) for REJECTED decision.")

        assert len(events_rejected) > 0, "No callback event dispatched for REJECTED decision!"
        evt_rej = events_rejected[0]
        event_id_rej = evt_rej["event_id"]
        print(f"   -> Event ID: {event_id_rej}")
        print(f"   -> Target Application: {evt_rej['application']}")
        print(f"   -> Rule Name: {evt_rej['rule']}")
        print(f"   -> Result: {evt_rej['result']}")

        evt_obj_rej = db.query(CallbackEvent).filter(CallbackEvent.event_id == event_id_rej).first()
        assert evt_obj_rej is not None
        attempts_rej = db.query(CallbackAttempt).filter(CallbackAttempt.callback_event_id == evt_obj_rej.id).all()
        assert len(attempts_rej) > 0, "No attempts recorded for rejected callback event!"
        att_rej = attempts_rej[0]
        print(f"   -> Request Method: {att_rej.http_method}")
        print(f"   -> Request URL: {att_rej.request_url}")
        print(f"   -> Response Code: {att_rej.response_status_code}")
        print(f"   -> Response Time: {att_rej.response_time_ms} ms")
        print(f"   -> Request Body:\n{att_rej.request_body}")

        req_payload_rej = json.loads(att_rej.request_body)
        assert req_payload_rej["fdo_decision"] == "REJECTED", "Dynamic variable approvalStatus was not replaced with 'REJECTED'!"
        assert req_payload_rej["document_number"] == "DOC-E2E-90001"
        assert req_payload_rej["transaction_id"] == "PK-E2E-889900"
        print("[VERIFIED] REJECTED decision dynamic variables replaced perfectly!")

        print("\n" + "=" * 70)
        print("ALL E2E APPROVAL & REJECTION CALLBACK TESTS PASSED CLEANLY (100% SUCCESS)!")
        print("=" * 70)

    except Exception as e:
        print(f"\n[ERROR] E2E Callback Sync Test Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_e2e_approval_callback_test()
