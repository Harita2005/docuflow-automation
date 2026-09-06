import sys
import os

from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import User

db = SessionLocal()

core_ids = [1, 214, 222, 1002, 1226]
core_usernames = ["admin", "VIGNESH", "YUVASREE", "VARUNAN", "Nattudurai", "NATTUDURAI"]

print("==========================================================")
print("  CLEANING UP USERS TABLE: KEEPING ONLY THE 5 CORE USERS")
print("==========================================================")

# Count before deletion
total_before = db.query(User).count()
print(f"Total users in DB before cleanup: {total_before}")

# Delete all users whose ID is NOT in core_ids and username NOT in core_usernames
deleted_count = db.query(User).filter(
    ~User.id.in_(core_ids),
    ~User.username.in_(core_usernames)
).delete(synchronize_session=False)

db.commit()

# Count after deletion
remaining_users = db.query(User).all()
print(f"\n[Cleanup Success] Deleted {deleted_count} test/extra users.")
print(f"Remaining users in DB count: {len(remaining_users)}\n")

print("--- REMAINING 5 CORE USERS ---")
for u in remaining_users:
    print(f"ID: {u.id:<5} | Role: {u.role:<10} | Active: {u.is_active}")

print("==========================================================")

db.close()
