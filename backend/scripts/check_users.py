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
    print(f"ID: {u.id} | Username: '{u.username}' | Employee ID: '{u.employee_id}' | Email: '{u.email}' | Role: '{u.role}' | Password Hash: '[PROTECTED]'")

db.close()
