import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import AfterValidator, Field

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


# A short blocklist of the passwords that show up at the very top of every
# breach corpus. Not a substitute for a real check (zxcvbn / a HIBP range
# query) — just enough that a 12-char minimum can't be satisfied with
# "password12345" or "123456789012". Compared case-insensitively.
_COMMON_PASSWORDS = frozenset(
    (
        "password password12 password123 password1234 password12345 passw0rd123 "
        "p@ssw0rd123 p@ssword1234 welcome123456 welcome1234 123456789012 1234567890123 "
        "12345678901234 0123456789012 qwertyuiop123 qwerty1234567 asdfghjkl1234 1qaz2wsx3edc "
        "iloveyou12345 letmein123456 administrator1 changeme12345 changemenow12 trustno123456 "
        "sunshine12345 princess12345 football12345 baseball12345 monkey1234567 dragon1234567 "
        "superman12345 batman1234567 michael123456 abc1234567890 aaaaaaaaaaaa test123456789 "
        "temp123456789 letmein1234 secret1234567"
    ).split()
)


def is_common_password(password: str) -> bool:
    """True for passwords on the top-of-every-breach-list blocklist."""
    return password.lower() in _COMMON_PASSWORDS


def _reject_common_password(value: str) -> str:
    if is_common_password(value):
        raise ValueError("This password is too common — pick something less guessable")
    return value


# The password policy, as a Pydantic field type: a 12-character floor plus the
# breach-list blocklist. Reused by signup, password reset, and change-password.
Password = Annotated[str, Field(min_length=12, max_length=128), AfterValidator(_reject_common_password)]


def generate_opaque_token() -> str:
    """High-entropy random string used for email-verification / reset / refresh tokens."""
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    """One-way hash for storing opaque tokens at rest (never store the raw token)."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
