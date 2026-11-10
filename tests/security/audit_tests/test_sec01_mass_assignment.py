import os
import sys

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice
from app.auth import create_access_token

client = TestClient(app)

def test_sec01_mass_assignment_status_rejected():
    db = SessionLocal()
    try:
        # Get active user and an existing document
        user = db.query(User).filter(User.is_active == True, User.is_deleted == False).first()
        doc = db.query(Invoice).filter(Invoice.is_deleted == False).first()
        assert user is not None and doc is not None

        token = create_access_token(data={"sub": user.username, "session_id": user.active_session_id or "test-sess"})
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to overwrite status directly via PUT
        res = client.put(
            f"/api/documents/{doc.id}",
            headers=headers,
            json={"status": "Approved"}
        )
        assert res.status_code == 400
        assert "Mass Assignment Protection" in res.text or "cannot be modified directly" in res.text

        # Attempt to overwrite assigned_approver directly via PUT
        res2 = client.put(
            f"/api/documents/{doc.id}",
            headers=headers,
            json={"assigned_approver": "hacker_approver"}
        )
        assert res2.status_code == 400
        assert "Mass Assignment Protection" in res2.text or "cannot be modified directly" in res2.text
    finally:
        db.close()
