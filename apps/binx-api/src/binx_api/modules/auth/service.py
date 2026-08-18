import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.core.email import send_password_reset_email, send_verification_email
from binx_api.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_password,
    hash_token,
    verify_password,
)
from binx_api.modules.auth.models import AuthToken, TokenPurpose
from binx_api.modules.auth.schemas import TokenPair
from binx_api.modules.users.models import User
from binx_api.modules.users.service import create_user, get_user_by_email, get_user_by_id, get_user_by_user_name

settings = get_settings()

_PURPOSE_TTL = {
    TokenPurpose.EMAIL_VERIFICATION: timedelta(hours=settings.email_verification_token_expire_hours),
    TokenPurpose.PASSWORD_RESET: timedelta(minutes=settings.password_reset_token_expire_minutes),
    TokenPurpose.REFRESH: timedelta(days=settings.refresh_token_expire_days),
}


async def _issue_token(db: AsyncSession, user: User, purpose: TokenPurpose) -> str:
    raw_token = generate_opaque_token()
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            purpose=purpose,
            expires_at=datetime.now(timezone.utc) + _PURPOSE_TTL[purpose],
        )
    )
    await db.commit()
    return raw_token


async def _consume_token(db: AsyncSession, raw_token: str, purpose: TokenPurpose) -> AuthToken:
    result = await db.execute(
        select(AuthToken).where(AuthToken.token_hash == hash_token(raw_token), AuthToken.purpose == purpose)
    )
    record = result.scalar_one_or_none()
    if record is None or record.used_at is not None or record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")

    record.used_at = datetime.now(timezone.utc)
    await db.commit()
    return record


async def _get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


async def _create_token_pair(db: AsyncSession, user: User) -> TokenPair:
    access_token = create_access_token(subject=str(user.id), extra_claims={"type": "access", "role": user.role})
    refresh_token = await _issue_token(db, user, TokenPurpose.REFRESH)
    return TokenPair(access_token=access_token, refresh_token=refresh_token)


async def signup(db: AsyncSession, *, user_name: str, email: str, full_name: str, password: str) -> User:
    if await get_user_by_email(db, email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if await get_user_by_user_name(db, user_name) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")

    user = await create_user(db, user_name=user_name, email=email, full_name=full_name, password=password)

    token = await _issue_token(db, user, TokenPurpose.EMAIL_VERIFICATION)
    send_verification_email(to=user.email, token=token)
    return user


async def verify_email(db: AsyncSession, raw_token: str) -> User:
    record = await _consume_token(db, raw_token, TokenPurpose.EMAIL_VERIFICATION)
    user = await _get_user_or_404(db, record.user_id)
    user.is_verified = True
    await db.commit()
    return user


async def resend_verification(db: AsyncSession, email: str) -> None:
    user = await get_user_by_email(db, email)
    if user is None or user.is_verified:
        return
    token = await _issue_token(db, user, TokenPurpose.EMAIL_VERIFICATION)
    send_verification_email(to=user.email, token=token)


async def login(db: AsyncSession, email: str, password: str) -> TokenPair:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email not verified")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return await _create_token_pair(db, user)


async def refresh(db: AsyncSession, raw_refresh_token: str) -> TokenPair:
    record = await _consume_token(db, raw_refresh_token, TokenPurpose.REFRESH)
    user = await _get_user_or_404(db, record.user_id)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    return await _create_token_pair(db, user)


async def request_password_reset(db: AsyncSession, email: str) -> None:
    user = await get_user_by_email(db, email)
    if user is None:
        return
    token = await _issue_token(db, user, TokenPurpose.PASSWORD_RESET)
    send_password_reset_email(to=user.email, token=token)


async def reset_password(db: AsyncSession, raw_token: str, new_password: str) -> None:
    record = await _consume_token(db, raw_token, TokenPurpose.PASSWORD_RESET)
    user = await _get_user_or_404(db, record.user_id)
    user.hashed_password = hash_password(new_password)
    await db.commit()

