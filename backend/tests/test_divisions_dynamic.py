from app.database.connection import SessionLocal
from app.database.models import Division, User
from app.routers.users import get_available_divisions, create_user_master, update_user_master, resolve_user_foreign_keys
from app.schemas.schemas import UserMasterCreate, UserMasterUpdate


def test_divisions_database_source_of_truth():
    """Verify that divisions are retrieved dynamically from the database and not hardcoded."""
    db = SessionLocal()
    try:
        active_divs = db.query(Division).filter(Division.is_active == True).all()
        # Ensure count reflects the full database configuration (>50 divisions)
        assert len(active_divs) >= 50, f"Expected at least 50 active divisions in DB, got {len(active_divs)}"

        div_codes = {d.code for d in active_divs}
        # Check required enterprise divisions mentioned in requirements
        assert "ACC_ER" in div_codes, "ACC_ER must exist in active divisions"
        assert "ACM_ERODE" in div_codes, "ACM_ERODE must exist in active divisions"
        assert "ATC_PROD" in div_codes, "ATC_PROD must exist in active divisions"
        assert "VCC" in div_codes, "VCC must exist in active divisions"

        # Verify get_available_divisions returns ID, code, and name
        mock_admin = User(id=1, username="admin", role="admin", is_active=True)
        results = get_available_divisions(db=db, current_user=mock_admin)
        assert len(results) >= 50
        assert all("id" in item and "code" in item and "name" in item for item in results)

        res_codes = {item["code"] for item in results}
        assert "ACC_ER" in res_codes
        assert "ACM_ERODE" in res_codes
        assert "ATC_PROD" in res_codes
    finally:
        db.close()


def test_resolve_user_foreign_keys():
    """Verify resolve_user_foreign_keys resolves both integer ID and code string."""
    db = SessionLocal()
    try:
        acc_er = db.query(Division).filter(Division.code == "ACC_ER").first()
        assert acc_er is not None

        # Resolve by integer ID
        div_id_1, _, _ = resolve_user_foreign_keys(db, acc_er.id, None, None)
        assert div_id_1 == acc_er.id

        # Resolve by string code
        div_id_2, _, _ = resolve_user_foreign_keys(db, "ACC_ER", None, None)
        assert div_id_2 == acc_er.id

        # Resolve by string ID ("6")
        div_id_3, _, _ = resolve_user_foreign_keys(db, str(acc_er.id), None, None)
        assert div_id_3 == acc_er.id
    finally:
        db.close()


def test_create_and_update_user_with_dynamic_division():
    """Verify user creation and update properly persist division_id and approval_divisions."""
    db = SessionLocal()
    test_emp_id = "TEST-DIV-9999"
    created_user_id = None
    try:
        # Clean up any leftover
        db.query(User).filter(User.employee_id == test_emp_id).delete()
        db.commit()

        acc_er = db.query(Division).filter(Division.code == "ACC_ER").first()
        atc_prod = db.query(Division).filter(Division.code == "ATC_PROD").first()
        assert acc_er is not None
        assert atc_prod is not None

        admin_actor = User(id=1, employee_name="Admin Test", username="admintest", role="admin", is_active=True)

        # Create user with division_id and approval_divisions
        create_payload = UserMasterCreate(
            employee_id=test_emp_id,
            employee_name="Division Test User",
            email="div_test_9999@testcorp.com",
            role="employee",
            division="ACC_ER",
            division_id=acc_er.id,
            approval_divisions="ACC_ER,ATC_PROD",
            department="Operations"
        )

        user_resp = create_user_master(payload=create_payload, current_user=admin_actor, db=db)
        created_user_id = user_resp.id

        # Verify saved record in database
        saved_user = db.query(User).filter(User.id == created_user_id).first()
        assert saved_user is not None
        assert saved_user.division == "ACC_ER"
        assert saved_user.division_id == acc_er.id
        assert "ACC_ER" in saved_user.approval_divisions
        assert "ATC_PROD" in saved_user.approval_divisions

        # Update user to ATC_PROD
        update_payload = UserMasterUpdate(
            division="ATC_PROD",
            division_id=atc_prod.id,
            approval_divisions="ATC_PROD"
        )
        updated_resp = update_user_master(user_id=created_user_id, payload=update_payload, current_user=admin_actor, db=db)
        assert updated_resp.division == "ATC_PROD"
        assert updated_resp.division_id == atc_prod.id
        assert updated_resp.approval_divisions == "ATC_PROD"

    finally:
        if created_user_id:
            db.query(User).filter(User.id == created_user_id).delete()
            db.commit()
        db.close()
