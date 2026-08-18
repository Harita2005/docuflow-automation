from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import os

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

load_dotenv()
from app.config import settings

SERVICE_API_USER = os.getenv("SERVICE_API_USER", "backend_sync_client")
SERVICE_API_PASS = os.getenv("SERVICE_API_PASS", "SecretPassword987654321!")
JWT_SECRET_KEY = settings.SECRET_KEY  # same secret used by /api/auth/login
JWT_ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

router = APIRouter(prefix="/m2m", tags=["M2M Machine-to-Machine"])
bearer_scheme = HTTPBearer()


class LoginRequest(BaseModel):
    username: str
    password: str


def verify_m2m_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        # Accept either M2M tokens (scope: data:sync) OR regular DB user tokens (has 'sub')
        if payload.get("scope") != "data:sync" and not payload.get("sub"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


@router.post("/auth/login")
def m2m_login(body: LoginRequest):
    if body.username != SERVICE_API_USER or body.password != SERVICE_API_PASS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = jwt.encode(
        {"sub": body.username, "scope": "data:sync", "exp": expire},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.post("/record", status_code=status.HTTP_200_OK)
def ingest_record(payload: Dict[str, Any], _: dict = Depends(verify_m2m_token)):
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload must not be empty")

    # ---------------------------------------------------------------
    # TODO: Insert database logic here
    # Example (SQLAlchemy):
    #   record = MyModel(**payload)
    #   db.add(record)
    #   db.commit()
    # ---------------------------------------------------------------

    return {"status": "received", "records_accepted": len(payload)}
