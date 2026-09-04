import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document
from app.routers.documents import resolve_checklist_items

db = SessionLocal()

print("==========================================================")
print("  TESTING CHECKLIST MATRIX RESOLUTION FOR SAMPLE DOCUMENTS:")
print("==========================================================")

# Mock test documents for VCC, ATC, RRF
vcc_doc = Document(id="TEST-VCC-001", division="VCC", category="Freight Charges", cost_center="ALL", plant="ALL")
atc_doc = Document(id="TEST-ATC-001", division="ATC", category="GRN Header", cost_center="ALL", plant="ALL")
rrf_doc = Document(id="TEST-RRF-001", division="RRF", category="GRN Header", cost_center="ALL", plant="ALL")

print("\n--- 1. VCC Purchase (Freight Charges) @ 'Attachment Status' ---")
items_vcc_att = resolve_checklist_items(db, vcc_doc, "Attachment Status")
print(f"Items Count: {len(items_vcc_att)}")
for i in items_vcc_att:
    print(f"  [x] {i}")

print("\n--- 2. ATC GRN Header @ 'Attachment Status' ---")
items_atc_att = resolve_checklist_items(db, atc_doc, "Attachment Status")
print(f"Items Count: {len(items_atc_att)}")
for i in items_atc_att:
    print(f"  [x] {i}")

print("\n--- 3. RRF GRN Header @ 'IA Approval' ---")
items_rrf_ia = resolve_checklist_items(db, rrf_doc, "IA Approval")
print(f"Items Count: {len(items_rrf_ia)}")
for i in items_rrf_ia:
    print(f"  [x] {i}")

db.close()
