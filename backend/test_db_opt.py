import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice, InvoiceLineItem

client = TestClient(app)

print("==================================================================")
print("             DOCUFLOW DB OPT & NORMALIZATION TEST                 ")
print("==================================================================")

db = SessionLocal()

# 1. TEST SOFT DELETES ON USERS
print("\n[1] Testing Soft Deletes on Users...")
# Let's find an active user
test_user = db.query(User).filter(User.is_deleted == False).first()
if not test_user:
    print("No active user found to test.")
else:
    user_id = test_user.id
    username = test_user.username
    print(f" - Active user: id={user_id}, username={username}")
    
    # Soft delete the user via API
    del_res = client.delete(f"/api/users/{user_id}")
    assert del_res.status_code == 200
    print(f" - DELETE /api/users/{user_id} returned 200 (Soft Deleted)")
    
    # Verify they are marked as deleted in DB
    db.expire_all()
    user_db = db.query(User).filter(User.id == user_id).first()
    assert user_db.is_deleted == True
    assert user_db.deleted_at is not None
    print(f" - Database confirms user.is_deleted is True (Time: {user_db.deleted_at})")
    
    # Verify user does not appear in GET list
    list_res = client.get("/api/users")
    assert list_res.status_code == 200
    user_ids = [u["id"] for u in list_res.json()]
    assert user_id not in user_ids
    print(" - GET /api/users listing excludes soft-deleted user (SUCCESS)")
    
    # Restore user for future tests
    user_db.is_deleted = False
    user_db.deleted_at = None
    db.commit()
    print(" - Restored user successfully.")

# 2. TEST LINE ITEM NORMALIZATION (OPTION 3)
print("\n[2] Testing Line Item Normalization...")
sync_payload = {
    "doc_key": 8901,
    "doc_num": "INV/2026/VCC/8901",
    "vendor_name": "LMW TEXTILE MACHINERY LTD",
    "amount": 250000.0,
    "division": "VCC",
    "category": "Asset with Cost Center",
    "plant": "TN-SIVAKASI",
    "line_items": [
        {
            "description": "Textile Loom Head A",
            "quantity": 2,
            "unit_price": 50000.0,
            "amount": 100000.0,
            "warranty_text": "24 Months Manufacturer Warranty",
            "serial_numbers": ["SN-LH-001", "SN-LH-002"]
        },
        {
            "description": "Loom Controller panel B",
            "quantity": 1,
            "unit_price": 150000.0,
            "amount": 150000.0,
            "warranty_text": "12 Months Warranty",
            "serial_numbers": "SN-CP-990"
        }
    ]
}
sync_res = client.post("/api/sync/document", json=sync_payload)
assert sync_res.status_code == 200
inv_id = sync_res.json()["document_id"]
print(f" - Synced invoice {inv_id} with 2 line items.")

# Query the normalized line items table
db.expire_all()
line_items = db.query(InvoiceLineItem).filter(InvoiceLineItem.invoice_id == inv_id).all()
print(f" - Found {len(line_items)} normalized rows in invoice_line_items table:")
for item in line_items:
    print(f"   * Item: {item.description} | Qty: {item.quantity} | Total: Rs.{item.amount} | Serials: {item.serial_numbers}")

assert len(line_items) == 2
assert line_items[0].description == "Textile Loom Head A"
assert line_items[0].quantity == 2.0
assert line_items[0].amount == 100000.0
assert line_items[1].description == "Loom Controller panel B"
assert line_items[1].quantity == 1.0
assert line_items[1].amount == 150000.0
print(" - Database assertions passed (Line item normalization works perfectly!)")

db.close()
print("\n==================================================================")
print("         ALL DATABASE OPTIMIZATION TESTS PASSED SUCCESSFULLY!     ")
print("==================================================================")
