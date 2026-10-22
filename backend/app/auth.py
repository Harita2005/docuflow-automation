import datetime
import logging
import secrets
import threading
import time
from typing import Optional, Any

import bcrypt
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt.exceptions import PyJWTError as JWTError
from sqlalchemy.orm import Session, joinedload

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
        options={"require": ["exp"], "verify_exp": True},
    )


# ---------------------------------------------------------------------------
# Current user & authentication cache
# ---------------------------------------------------------------------------

_USER_CACHE: dict = {}
_USER_CACHE_LOCK = threading.Lock()
_USER_CACHE_TTL = 10.0  # 10-second TTL for authenticated session lookups

def invalidate_user_cache(username: Optional[str] = None):
    """Purges cached authenticated user models upon logout or role changes."""
    with _USER_CACHE_LOCK:
        if username:
            _USER_CACHE.pop(str(username).lower(), None)
            _USER_CACHE.pop(str(username), None)
        else:
            _USER_CACHE.clear()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate the JWT Bearer token and return the authenticated user.
    Uses in-memory cache to eliminate repetitive DB queries under high concurrency.
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

    # Check cache first
    now = time.monotonic()
    user = None
    u_key = str(username).lower()
    with _USER_CACHE_LOCK:
        entry = _USER_CACHE.get(u_key)
        if entry and (now - entry["timestamp"] < _USER_CACHE_TTL):
            user = entry["user"]

    if user is not None:
        try:
            user = db.merge(user, load=False)
        except Exception as exc:
            # Benign: database session already contains an instance or detached merge is unsupported
            logger.debug("Database merge for cached user ignored: %s", exc)
    else:
        # Fast direct index seek on username first with joinedload for role_rel
        user = (
            db.query(User)
            .options(joinedload(User.role_rel))
            .filter(User.username == username, User.is_deleted == False)
            .first()
        )
        if not user:
            # Fallback for employee_id or email
            user = (
                db.query(User)
                .options(joinedload(User.role_rel))
                .filter(
                    User.employee_id == username,
                    User.is_deleted == False
                )
                .first()
            )

        if user is None:
            raise credentials_exception

        try:
            db.expunge(user)
        except Exception as exc:
            # Benign: user may already be detached from the active session
            logger.debug("Database expunge for cached user ignored: %s", exc)

        with _USER_CACHE_LOCK:
            _USER_CACHE[u_key] = {"user": user, "timestamp": now}

        try:
            user = db.merge(user, load=False)
        except Exception as exc:
            # Benign: re-attaching user to active session ignored if already bound
            logger.debug("Database re-merge for user ignored: %s", exc)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Access denied.",
        )

    # SEC-03: Compare token session_id with active_session_id in database
    token_session_id = payload.get("session_id")
    if token_session_id is not None:
        if not user.active_session_id or user.active_session_id != token_session_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been invalidated or displaced by another login. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
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

    now = time.monotonic()
    user = None
    u_key = str(username).lower()
    with _USER_CACHE_LOCK:
        entry = _USER_CACHE.get(u_key)
        if entry and (now - entry["timestamp"] < _USER_CACHE_TTL):
            user = entry["user"]

    if user is not None:
        try:
            user = db.merge(user, load=False)
        except Exception as exc:
            # Benign: database session already contains an instance or detached merge is unsupported
            logger.debug("Database merge for optional cached user ignored: %s", exc)
    else:
        user = (
            db.query(User)
            .options(joinedload(User.role_rel))
            .filter(User.username == username, User.is_deleted == False)
            .first()
        )
        if not user:
            user = (
                db.query(User)
                .options(joinedload(User.role_rel))
                .filter(
                    User.employee_id == username,
                    User.is_deleted == False
                )
                .first()
            )
        if user:
            try:
                db.expunge(user)
            except Exception as exc:
                # Benign: user may already be detached from the active session
                logger.debug("Database expunge for optional user ignored: %s", exc)
            with _USER_CACHE_LOCK:
                _USER_CACHE[u_key] = {"user": user, "timestamp": now}
            try:
                user = db.merge(user, load=False)
            except Exception as exc:
                # Benign: re-attaching user to active session ignored if already bound
                logger.debug("Database re-merge for optional user ignored: %s", exc)

    if user and user.is_active:
        token_session_id = payload.get("session_id")
        if token_session_id is not None:
            if not user.active_session_id or user.active_session_id != token_session_id:
                return None
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

    # X-API-Key authentication (constant-time byte comparison against timing attacks)
    if expected_key and x_api_key:
        cleaned_key = x_api_key.strip()
        expected_cleaned = str(expected_key).strip()
        if cleaned_key and expected_cleaned:
            if secrets.compare_digest(
                cleaned_key.encode("utf-8"),
                expected_cleaned.encode("utf-8"),
            ):
                return True

    # JWT service/admin authentication
    if credentials and credentials.credentials:
        try:
            payload = decode_token(credentials.credentials)

            subject = payload.get("sub")
            role = payload.get("role")
            scope = payload.get("scope")

            # 1. Any token carrying scope 'data:sync' is directly authorized for records sync
            if scope == "data:sync":
                return True

            # 2. Service client roles
            if role in {"service", "service_client"} or subject in {"backend_sync_client", "sync_service"}:
                return True

            # 3. Active authenticated user JWT
            if subject:
                from sqlalchemy import or_
                user = (
                    db.query(User)
                    .filter(
                        (User.username == subject)
                        | (User.email == subject)
                        | (User.employee_id == subject)
                    )
                    .filter(or_(User.is_deleted == False, User.is_deleted.is_(None)))
                    .first()
                )

                if user and user.is_active:
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


# ---------------------------------------------------------------------------
# Dual Authentication: User JWT OR Valid Service Key
# ---------------------------------------------------------------------------

async def get_current_user_or_service_key(
    x_api_key: Optional[str] = Header(
        None,
        alias="X-API-Key",
    ),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Any:
    """
    Validate that the incoming request is authenticated either by:
    1. A valid X-API-Key configured through SERVICE_API_KEY
    2. A valid service Bearer JWT
    3. A valid active user Bearer JWT

    If both credentials are missing or both are invalid, raises HTTP 401 Unauthorized.
    """
    # 1. Check X-API-Key
    expected_key = getattr(
        settings,
        "SERVICE_API_KEY",
        None,
    )
    if expected_key and x_api_key:
        cleaned_key = x_api_key.strip()
        expected_cleaned = str(expected_key).strip()
        if cleaned_key and expected_cleaned:
            if secrets.compare_digest(
                cleaned_key.encode("utf-8"),
                expected_cleaned.encode("utf-8"),
            ):
                return {
                    "is_service": True,
                    "identity": "service_api_key",
                    "role": "service",
                    "username": "service_api_key",
                }

    # 2. Check Bearer token (service JWT or user JWT)
    if credentials and credentials.credentials:
        try:
            payload = decode_token(credentials.credentials)
        except (JWTError, Exception) as exc:
            logger.debug("Bearer token decode error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        subject = payload.get("sub") or payload.get("username")
        role = payload.get("role")
        scope = payload.get("scope")

        # Service tokens: must carry scope 'data:sync' to be accepted as service identity
        if scope == "data:sync" and (
            subject in {"backend_sync_client", "sync_service"} or role == "service"
        ):
            return {
                "is_service": True,
                "identity": subject or "sync_service",
                "role": "service",
                "username": subject or "sync_service",
                "scope": scope,
            }

        if not subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

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

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated. Access denied.",
            )

        return user

    # 3. Neither valid service key nor valid Bearer token provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide a valid Bearer token or X-API-Key.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_permission_or_service(permission: str):
    """
    Factory creating a FastAPI dependency that verifies the caller is either:
    1. A valid M2M service caller (X-API-Key or Service JWT), OR
    2. An authenticated user possessing the specified RBAC permission (or admin).

    Returns 401 if unauthenticated, 403 if user lacks required permission.
    """
    async def _perm_dependency(
        auth_entity: Any = Depends(get_current_user_or_service_key),
        db: Session = Depends(get_db),
    ) -> Any:
        if isinstance(auth_entity, dict) and auth_entity.get("is_service"):
            return auth_entity

        from app.services.rbac_service import check_permission
        if not check_permission(auth_entity, permission, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Missing required permission '{permission}'.",
            )

        return auth_entity

    return _perm_dependency


__all__ = [
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "decode_token",
    "get_current_user",
    "get_current_user_optional",
    "get_current_active_user",
    "verify_service_api_key",
    "get_current_user_or_service_key",
    "require_permission_or_service",
]