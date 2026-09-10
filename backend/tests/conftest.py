import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_password_hash
from app.database.connection import Base, get_db
from app.database.models import Division, Role, User, WorkflowProfile, WorkflowStepDefinition
from app.main import app

# Use SQLite in-memory with StaticPool for test isolation
SQLALCHEMY_DATABASE_URL = 'sqlite:///:memory:'
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={'check_same_thread': False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def seed_test_data(db_session):
    # Divisions
    vcc = Division(code='VCC', name='VCC Division')
    sd = Division(code='SD', name='SD Division')
    hq = Division(code='HQ', name='HQ Corporate')
    db_session.add_all([vcc, sd, hq])
    db_session.flush()

    # Roles
    admin_role = Role(code='admin', name='Administrator', description='Full admin')
    gm_role = Role(code='gm', name='General Manager', description='GM')
    emp_role = Role(code='employee', name='Employee', description='Standard employee')
    db_session.add_all([admin_role, gm_role, emp_role])
    db_session.flush()

    # Users
    admin_user = User(
        username='admin',
        email='admin@docuflow.local',
        phone_number='+91 98765 43210',
        password_hash=get_password_hash('AdminSecure2026!'),
        role='admin',
        division='HQ',
        role_id=admin_role.id,
        is_active=True,
        employee_id='EMP001',
        employee_name='System Admin',
        name='System Admin'
    )
    vcc_gm = User(
        username='vcc_gm',
        email='gm.vcc@docuflow.local',
        phone_number='+91 98765 43211',
        password_hash=get_password_hash('GmPassword2026!'),
        role='gm',
        division='VCC',
        role_id=gm_role.id,
        is_active=True,
        employee_id='EMP002',
        employee_name='VCC General Manager',
        name='VCC General Manager'
    )
    sd_emp = User(
        username='sd_emp',
        email='emp.sd@docuflow.local',
        phone_number='+91 98765 43212',
        password_hash=get_password_hash('SdPassword2026!'),
        role='employee',
        division='SD',
        role_id=emp_role.id,
        is_active=True,
        employee_id='EMP003',
        employee_name='SD Desk Operator',
        name='SD Desk Operator'
    )
    inactive_user = User(
        username='inactive_user',
        email='inactive@docuflow.local',
        phone_number='+91 98765 43219',
        password_hash=get_password_hash('InactivePass2026!'),
        role='employee',
        division='VCC',
        role_id=emp_role.id,
        is_active=False,
        employee_id='EMP999',
        employee_name='Deactivated Staff',
        name='Deactivated Staff'
    )
    db_session.add_all([admin_user, vcc_gm, sd_emp, inactive_user])

    # Workflow Profile & Steps
    wf = WorkflowProfile(
        profile_name='STANDARD_AP_2STAGE',
        workflow_type='AP INVOICE',
        status='Active'
    )
    db_session.add(wf)
    db_session.flush()

    step1 = WorkflowStepDefinition(
        profile_name=wf.profile_name,
        stage_number=1,
        step_name='Attachment Status',
        approver_target='sd_emp, vcc_gm',
        action_required='Approve'
    )
    step2 = WorkflowStepDefinition(
        profile_name=wf.profile_name,
        stage_number=2,
        step_name='Final Settlement',
        approver_target='vcc_gm',
        action_required='Approve'
    )
    db_session.add_all([step1, step2])
    db_session.commit()

    return {
        'admin': admin_user,
        'vcc_gm': vcc_gm,
        'sd_emp': sd_emp,
        'inactive': inactive_user,
        'workflow': wf
    }
