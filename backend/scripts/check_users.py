import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User

db = SessionLocal()

print("==========================================================")
print("  LIST OF REGISTERED USERS IN DATABASE:")
print("==========================================================")

users = db.query(User).all()
for u in users:
    masked_email = u.email[:2] + "***@" + u.email.split("@")[-1] if u.email and "@" in u.email else "[PROTECTED]"
    print(f"ID: {u.id} | Role: '{u.role}' | Active: {u.is_active} | Email: '{masked_email}'")

db.close()
