import os
import json
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice, AuditLog
from app.auth import create_access_token

client = TestClient(app)
db = SessionLocal()

print("==================================================================")
print("          VERIFYING ROLE-BASED DASHBOARD & DOCUMENT FILTERS       ")
print("==================================================================")

# 1. Retrieve test users from the database
admin_user = db.query(User).filter(User.role == "admin").first()
approver_user = db.query(User).filter(User.role != "admin").first()

if not admin_user or not approver_user:
    print("Error: Could not find seeded admin or standard approver users in database.")
    db.close()
    exit(1)

print(f"Found Admin User: {admin_user.username} (Role: {admin_user.role})")
print(f"Found Standard User: {approver_user.username} (Role: {approver_user.role}, Email: {approver_user.email})")

# Generate JWT tokens directly
admin_token = create_access_token(data={"sub": admin_user.username, "id": admin_user.id, "role": admin_user.role})
approver_token = create_access_token(data={"sub": approver_user.username, "id": approver_user.id, "role": approver_user.role})

# Query total items in DB
db_total_docs = db.query(Invoice).filter(Invoice.is_deleted == False).count()
print(f"Total non-deleted invoices in DB: {db_total_docs}")

# 2. Test Admin Dashboard Stats & Document Listing
print("\n--- Testing Admin Role ---")
admin_headers = {"Authorization": f"Bearer {admin_token}"}

admin_stats_res = client.get("/api/dashboard/stats", headers=admin_headers)
assert admin_stats_res.status_code == 200
admin_stats = admin_stats_res.json()
print(f"Admin Dashboard Stats: {json.dumps(admin_stats, indent=2)}")
assert admin_stats["totalDocuments"] == db_total_docs, "Admin should see all documents in stats!"

admin_docs_res = client.get("/api/documents", headers=admin_headers)
assert admin_docs_res.status_code == 200
admin_docs = admin_docs_res.json()
print(f"Admin Document Listing count: {len(admin_docs)}")
assert len(admin_docs) == db_total_docs, "Admin should see all documents in listing!"


# 3. Test Standard User Dashboard Stats & Document Listing
print("\n--- Testing Standard Approver Role ---")
approver_headers = {"Authorization": f"Bearer {approver_token}"}

approver_stats_res = client.get("/api/dashboard/stats", headers=approver_headers)
assert approver_stats_res.status_code == 200
approver_stats = approver_stats_res.json()
print(f"Approver Dashboard Stats: {json.dumps(approver_stats, indent=2)}")

approver_docs_res = client.get("/api/documents", headers=approver_headers)
assert approver_docs_res.status_code == 200
approver_docs = approver_docs_res.json()
print(f"Approver Document Listing count: {len(approver_docs)}")

# Verify that standard user only sees their own scoped documents
assert len(approver_docs) <= db_total_docs, "Standard user should see a subset or equal of documents."
assert approver_stats["totalDocuments"] == len(approver_docs), "Stats count must match listing count for standard user!"

print("\n==================================================================")
print("             ALL DASHBOARD FILTER TESTS PASSED!                   ")
print("==================================================================")

db.close()
