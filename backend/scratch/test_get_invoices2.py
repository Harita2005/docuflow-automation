import sys, os
# Ensure the backend package is on the path
backend_path = os.path.abspath('backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.database.connection import SessionLocal
from app.routers.documents import get_all_invoices
from app.database.models import User

def main():
    with SessionLocal() as db:
        # Fetch an admin user for testing
        admin_user = db.query(User).filter(User.role == 'admin').first()
        if not admin_user:
            print('No admin user found')
            return
        invoices = get_all_invoices(status=None, db=db, current_user=admin_user)
        print('Fetched', len(invoices), 'invoices')
        # Print first invoice fields to verify
        if invoices:
            inv = invoices[0]
            print('First invoice example:', inv.dict())

if __name__ == '__main__':
    main()
