import sys, os
sys.path.insert(0, 'backend')
from app.database.connection import SessionLocal
from app.routers.documents import get_all_invoices
from app.database.models import User

def main():
    with SessionLocal() as db:
        admin = db.query(User).filter(User.role == 'admin').first()
        if not admin:
            print('No admin user found')
            return
        result = get_all_invoices(status=None, db=db, current_user=admin)
        print('Fetched', len(result), 'invoices')

if __name__ == '__main__':
    main()
