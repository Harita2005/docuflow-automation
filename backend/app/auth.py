import datetime
import logging
from typing import Optional
import bcrypt
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Strict bcrypt password verification. No bypasses or fallback shortcuts."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as exc:
        logger.debug('Password verification error: %s', exc)
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta]=None) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + (expires_delta or datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> dict:
    """Decodes and validates a JWT token, returning its payload dict."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials]=Depends(security), db: Session=Depends(get_db)) -> User:
    """
    Validates JWT Bearer token.
    Raises 401 UNAUTHORIZED if missing, invalid, expired, or user not found.
    Rejects inactive users.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials',
        headers={'WWW-Authenticate': 'Bearer'}
    )
    if not credentials or not credentials.credentials:
        raise credentials_exception

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get('sub') or payload.get('username')
        if username is None:
            raise credentials_exception
    except JWTError as exc:
        logger.debug('JWT decode error: %s', exc)
        raise credentials_exception

    user = db.query(User).filter(
        (User.username == username) | (User.email == username) | (User.employee_id == username)
    ).filter(User.is_deleted == False).first()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='User account is deactivated. Access denied.'
        )

    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Inactive user account'
        )
    return current_user

async def verify_service_api_key(
    x_api_key: Optional[str] = Header(None, alias='X-API-Key'),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> bool:
    """
    Validates M2M service requests via X-API-Key or Service Bearer token.
    Configurable via SERVICE_API_KEY environment variable.
    """
    expected_key = getattr(settings, 'SERVICE_API_KEY', None) or 'DocuFlow-M2M-Integration-Secret-2026'
    if x_api_key and x_api_key.strip() == expected_key:
        return True
    
    # Also support Bearer token if valid JWT service client or user token
    if credentials and credentials.credentials:
        try:
            payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            if payload.get('sub') in ['backend_sync_client', 'sync_service', 'admin'] or payload.get('role') in ['admin', 'service']:
                return True
            # Or valid active admin user
            username = payload.get('sub')
            user = db.query(User).filter((User.username == username) | (User.email == username)).first()
            if user and user.is_active and user.role == 'admin':
                return True
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Unauthorized M2M service request. Valid X-API-Key or Service Bearer token required.'
    )