import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from binx_api.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def create_ws_ticket(subject: str) -> str:
    """A short-lived, single-purpose token the browser trades for a websocket
    connection. It carries ``type: "ws"`` so it can never be used as an access
    token, and expires in seconds — long enough to open one socket, not long
    enough to be worth stealing. See auth/router.py's ``/auth/ws-ticket``."""
    expire = datetime.now(UTC) + timedelta(seconds=settings.ws_ticket_expire_seconds)
    payload = {"sub": subject, "exp": expire, "type": "ws"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_ws_ticket(token: str) -> str | None:
    """Returns the subject (user id) of a valid, unexpired ws ticket, or None."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != "ws" or "sub" not in payload:
        return None
    return str(payload["sub"])


def generate_opaque_token() -> str:
    """High-entropy random string used for email-verification / reset / refresh tokens."""
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    """One-way hash for storing opaque tokens at rest (never store the raw token)."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
