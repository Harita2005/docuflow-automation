import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, InAppNotification

db = SessionLocal()

print("==========================================================")
print("  TESTING DB QUERY FOR STATS & DOCUMENTS:")
print("==========================================================")

try:
    docs = db.query(Document).all()
    print(f"[Success] Fetched {len(docs)} documents cleanly.")
except Exception as e:
    print(f"[ERROR Documents] {e}")

try:
    notifs = db.query(InAppNotification).all()
    print(f"[Success] Fetched {len(notifs)} notifications cleanly.")
except Exception as e:
    print(f"[ERROR Notifications] {e}")

db.close()
