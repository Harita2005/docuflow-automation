import sys
sys.path.insert(0, 'backend')

from app.database.connection import SessionLocal
from app.database.models import Document
from sqlalchemy import text

db = SessionLocal()

res = db.execute(text("UPDATE documents SET document_type = 'CUSTOMER FEEDBACK' WHERE document_type = 'CUSTOMER COMPLAINT' OR document_type LIKE '%COMPLAINT%'"))
db.commit()
print("Updated DB rows:", res.rowcount)

docs = db.query(Document).filter(Document.is_deleted == False).all()
counts = {}
for d in docs:
    dt = d.document_type or 'OTHER'
    counts[dt] = counts.get(dt, 0) + 1

print("\nCurrent DB Document Types & Counts:")
for k, v in sorted(counts.items()):
    print(f"  - {k}: {v}")

db.close()
