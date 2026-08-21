from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

def cleanup_users():
    db = SessionLocal()
    try:
        print('>>> 1. Ensuring the 4 Target User Accounts...')
        
        # 1. Admin
        admin = db.query(User).filter(User.username == 'admin').first()
        if not admin:
            admin = User(
                username='admin',
                name='System Administrator',
                employee_name='System Administrator',
                employee_id='ADMIN01',
                email='admin@ramrajcotton.net',
                role='admin',
                password_hash=get_password_hash('Admin@12345'),
                is_active=True,
                is_deleted=False
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        else:
            admin.is_active = True
            admin.is_deleted = False
            admin.role = 'admin'
            db.commit()

        # 2. Yuvasree
        yuva = db.query(User).filter(
            (User.employee_id == 'E24-04070') | (User.username == 'YUVASREE (E24-04070)')
        ).first()
        if not yuva:
            yuva = User(
                username='YUVASREE (E24-04070)',
                name='YUVASREE',
                employee_name='YUVASREE',
                employee_id='E24-04070',
                email='wmssupport@ramrajcotton.net',
                role='employee',
                password_hash=get_password_hash('User@12345'),
                is_active=True,
                is_deleted=False
            )
            db.add(yuva)
            db.commit()
            db.refresh(yuva)
        else:
            yuva.username = 'YUVASREE (E24-04070)'
            yuva.name = 'YUVASREE'
            yuva.employee_name = 'YUVASREE'
            yuva.employee_id = 'E24-04070'
            yuva.email = 'wmssupport@ramrajcotton.net'
            yuva.role = 'employee'
            yuva.is_active = True
            yuva.is_deleted = False
            db.commit()

        # 3. Vignesh
        vignesh = db.query(User).filter(
            (User.employee_id == 'VIGNESH_E25-01583') | (User.username == 'VIGNESH_E25-01583')
        ).first()
        if not vignesh:
            vignesh = User(
                username='VIGNESH_E25-01583',
                name='VIGNESH',
                employee_name='VIGNESH',
                employee_id='VIGNESH_E25-01583',
                email='vignesh.m@ramrajcotton.net',
                role='manager',
                password_hash=get_password_hash('User@12345'),
                is_active=True,
                is_deleted=False
            )
            db.add(vignesh)
            db.commit()
            db.refresh(vignesh)
        else:
            vignesh.username = 'VIGNESH_E25-01583'
            vignesh.name = 'VIGNESH'
            vignesh.employee_name = 'VIGNESH'
            vignesh.employee_id = 'VIGNESH_E25-01583'
            vignesh.email = 'vignesh.m@ramrajcotton.net'
            vignesh.role = 'manager'
            vignesh.is_active = True
            vignesh.is_deleted = False
            db.commit()

        # 4. Varunan
        varunan = db.query(User).filter(
            (User.employee_id == 'E22_02046') | (User.username == 'VARUNAN (E22_02046)')
        ).first()
        if not varunan:
            varunan = User(
                username='VARUNAN (E22_02046)',
                name='VARUNAN',
                employee_name='VARUNAN',
                employee_id='E22_02046',
                email='varunan.r@ramrajcotton.net',
                role='employee',
                password_hash=get_password_hash('User@12345'),
                is_active=True,
                is_deleted=False
            )
            db.add(varunan)
            db.commit()
            db.refresh(varunan)
        else:
            varunan.username = 'VARUNAN (E22_02046)'
            varunan.name = 'VARUNAN'
            varunan.employee_name = 'VARUNAN'
            varunan.employee_id = 'E22_02046'
            varunan.email = 'varunan.r@ramrajcotton.net'
            varunan.role = 'employee'
            varunan.is_active = True
            varunan.is_deleted = False
            db.commit()

        print('>>> 2. Deleting all other users from database...')
        keep_ids = [admin.id, yuva.id, vignesh.id, varunan.id]
        
        deleted_count = db.query(User).filter(~User.id.in_(keep_ids)).delete(synchronize_session=False)
        db.commit()
        print(f'  [SUCCESS] Removed {deleted_count} unnecessary users.')

        remaining = db.query(User).all()
        print(f'\n>>> Remaining Active Users ({len(remaining)}):')
        for u in remaining:
            print(f'  • {u.name} ({u.employee_id}) - Role: {u.role} - Email: {u.email} - Username: {u.username}')

    except Exception as e:
        print(f'[ERROR] {e}')
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == '__main__':
    cleanup_users()
