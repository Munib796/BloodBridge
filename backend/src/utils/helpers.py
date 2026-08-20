from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException, status
from pwdlib import PasswordHash

from src.utils.settings import settings

password_hasher = PasswordHash.recommended()


# --- Passwords -------------------------------------------------------------

def hash_password(plain_password: str) -> str:
    return password_hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return password_hasher.verify(plain_password, password_hash)


# --- JWT ---------------------------------------------------------------

def create_access_token(data: dict[str, Any]) -> str:
    """Create a login/session token. `data` must include at least
    {"role": "...", "id": "<entity-uuid>"}."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "purpose": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_purpose_token(data: dict[str, Any], purpose: str, expire_minutes: int | None = None) -> str:
    """Create a short-lived token for email verification / password reset,
    identified by its `purpose` claim. No separate token table needed."""
    to_encode = data.copy()
    minutes = expire_minutes if expire_minutes is not None else settings.EMAIL_TOKEN_EXPIRE_MINUTES
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    to_encode.update({"exp": expire, "purpose": purpose})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def decode_token_for_purpose(token: str, expected_purpose: str) -> dict[str, Any]:
    payload = decode_token(token)
    if payload.get("purpose") != expected_purpose:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token purpose")
    return payload


def decode_access_token(token: str, expected_role: str) -> dict[str, Any]:
    payload = decode_token(token)
    if payload.get("purpose") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token purpose")
    if payload.get("role") != expected_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this role")
    return payload
