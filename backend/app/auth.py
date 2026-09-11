import datetime
import logging
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import User


logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------

def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """Verify a password using bcrypt."""
    if not plain_password or not hashed_password:
        return False

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception as exc:
        logger.debug("Password verification error: %s", exc)
        return False


def get_password_hash(password: str) -> str:
    """Create a bcrypt password hash."""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_access_token(
    data: dict,
    expires_delta: Optional[datetime.timedelta] = None,
) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()

    expire = datetime.datetime.now(datetime.timezone.utc) + (
        expires_delta
        or datetime.timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    )

    to_encode["exp"] = expire

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """Decode and validate a JWT access token."""
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
    )


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate the JWT Bearer token and return the authenticated user.
    """

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials or not credentials.credentials:
        raise credentials_exception

    try:
        payload = decode_token(credentials.credentials)

        username = payload.get("sub") or payload.get("username")

        if not username:
            raise credentials_exception

    except JWTError as exc:
        logger.debug("JWT decode error: %s", exc)
        raise credentials_exception

    user = (
        db.query(User)
        .filter(
            (User.username == username)
            | (User.email == username)
            | (User.employee_id == username)
        )
        .filter(User.is_deleted == False)
        .first()
    )

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Access denied.",
        )

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Validate the JWT Bearer token if present; return None if no authorization credentials are sent.
    """
    if not credentials or not credentials.credentials:
        return None

    try:
        payload = decode_token(credentials.credentials)
        username = payload.get("sub") or payload.get("username")
        if not username:
            return None
    except Exception as exc:
        logger.debug("Optional JWT decode error: %s", exc)
        return None

    user = (
        db.query(User)
        .filter(
            (User.username == username)
            | (User.email == username)
            | (User.employee_id == username)
        )
        .filter(User.is_deleted == False)
        .first()
    )

    if user and user.is_active:
        return user
    return None


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Return the currently authenticated active user."""

    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return current_user


# ---------------------------------------------------------------------------
# Service authentication
# ---------------------------------------------------------------------------

async def verify_service_api_key(
    x_api_key: Optional[str] = Header(
        None,
        alias="X-API-Key",
    ),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> bool:
    """
    Validate service-to-service requests.

    Authentication can be performed using:
    1. X-API-Key configured through SERVICE_API_KEY
    2. A valid service JWT
    3. A valid active admin JWT
    """

    expected_key = getattr(
        settings,
        "SERVICE_API_KEY",
        None,
    )

    # X-API-Key authentication
    if expected_key and x_api_key:
        if x_api_key.strip() == expected_key:
            return True

    # JWT service/admin authentication
    if credentials and credentials.credentials:
        try:
            payload = decode_token(credentials.credentials)

            subject = payload.get("sub")
            role = payload.get("role")

            # Service tokens
            if subject in {
                "backend_sync_client",
                "sync_service",
            }:
                return True

            if role == "service":
                return True

            # Admin JWT
            if subject:
                user = (
                    db.query(User)
                    .filter(
                        (User.username == subject)
                        | (User.email == subject)
                        | (User.employee_id == subject)
                    )
                    .filter(User.is_deleted == False)
                    .first()
                )

                if (
                    user
                    and user.is_active
                    and user.role == "admin"
                ):
                    return True

        except JWTError as exc:
            logger.debug(
                "Service JWT verification error: %s",
                exc,
            )
        except Exception as exc:
            logger.debug(
                "Service authentication error: %s",
                exc,
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Unauthorized M2M service request. "
            "Valid X-API-Key or Service Bearer token required."
        ),
    )


__all__ = [
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "decode_token",
    "get_current_user",
    "get_current_user_optional",
    "get_current_active_user",
    "verify_service_api_key",
]