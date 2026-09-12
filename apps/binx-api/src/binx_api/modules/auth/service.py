import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.core.email import send_email_change_email, send_password_reset_email, send_verification_email
from binx_api.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_password,
    hash_token,
    verify_password,
)
from binx_api.modules.activity import service as activity_service
from binx_api.modules.auth.models import AuthToken, TokenPurpose
from binx_api.modules.auth.schemas import TokenPair
from binx_api.modules.users.models import User
from binx_api.modules.users.service import create_user, get_user_by_email, get_user_by_id, get_user_by_user_name

settings = get_settings()

_PURPOSE_TTL = {
    TokenPurpose.EMAIL_VERIFICATION: timedelta(hours=settings.email_verification_token_expire_hours),
    TokenPurpose.PASSWORD_RESET: timedelta(minutes=settings.password_reset_token_expire_minutes),
    TokenPurpose.REFRESH: timedelta(days=settings.refresh_token_expire_days),
    # Reuses the verification window — same "click a link in your inbox" shape as EMAIL_VERIFICATION.
    TokenPurpose.EMAIL_CHANGE: timedelta(hours=settings.email_verification_token_expire_hours),
}


async def _prune_stale_tokens(db: AsyncSession) -> None:
    """Opportunistic housekeeping: drop rows whose usefulness is long gone
    (expired for over a day). Cheap, runs on the same commit as the fresh
    token below, and keeps ``auth_tokens`` from growing without bound. A
    used-but-unexpired refresh row is left alone — it's what replay detection
    in ``refresh()`` reads."""
    cutoff = datetime.now(UTC) - timedelta(days=1)
    await db.execute(delete(AuthToken).where(AuthToken.expires_at < cutoff))


async def _issue_token(db: AsyncSession, user: User, purpose: TokenPurpose, *, new_email: str | None = None) -> str:
    raw_token = generate_opaque_token()
    await _prune_stale_tokens(db)
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            purpose=purpose,
            new_email=new_email,
            expires_at=datetime.now(UTC) + _PURPOSE_TTL[purpose],
        )
    )
    await db.commit()
    return raw_token


async def _consume_token(db: AsyncSession, raw_token: str, purpose: TokenPurpose) -> AuthToken:
    """Marks a single-use token spent. The UPDATE is guarded on ``used_at IS
    NULL`` so two requests racing the same token can't both win."""
    record = await _peek_token(db, raw_token, purpose)
    result = await db.execute(
        update(AuthToken)
        .where(AuthToken.id == record.id, AuthToken.used_at.is_(None))
        .values(used_at=datetime.now(UTC))
    )
    if result.rowcount != 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    await db.commit()
    return record


async def _peek_token(db: AsyncSession, raw_token: str, purpose: TokenPurpose) -> AuthToken:
    """Looks up a token without consuming it, e.g. to preview who it belongs to."""
    result = await db.execute(
        select(AuthToken).where(AuthToken.token_hash == hash_token(raw_token), AuthToken.purpose == purpose)
    )
    record = result.scalar_one_or_none()
    if record is None or record.used_at is not None or record.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
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


async def signup(
    db: AsyncSession,
    *,
    user_name: str,
    email: str,
    full_name: str,
    password: str,
    portal_invite_token: str | None = None,
) -> User:
    # One generic message whether the email or the username collided — telling
    # an unauthenticated caller *which* one is taken hands them an account-
    # enumeration oracle. (The unique constraints on both columns are the real
    # guard; this check is just for a friendlier error than a raw IntegrityError.)
    if await get_user_by_email(db, email) is not None or await get_user_by_user_name(db, user_name) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email or username is already registered")

    user = await create_user(db, user_name=user_name, email=email, full_name=full_name, password=password)

    token = await _issue_token(db, user, TokenPurpose.EMAIL_VERIFICATION)
    # portal_invite_token is passed through opaquely — never validated here.
    # An invalid/expired one is simply a dead link once they land back on
    # /auth/portal-invite, where previewPortalInvitation already surfaces
    # that error; nothing here needs to know or care.
    send_verification_email(to=user.email, token=token, portal_invite_token=portal_invite_token)
    return user


async def verify_email(db: AsyncSession, raw_token: str) -> TokenPair:
    record = await _consume_token(db, raw_token, TokenPurpose.EMAIL_VERIFICATION)
    user = await _get_user_or_404(db, record.user_id)
    user.is_verified = True
    await db.commit()
    return await _create_token_pair(db, user)


async def get_email_verification_target(db: AsyncSession, raw_token: str) -> User:
    """Resolves the account a verification token belongs to without consuming it, so the
    verify-email page can preview the email before the user actually confirms."""
    record = await _peek_token(db, raw_token, TokenPurpose.EMAIL_VERIFICATION)
    return await _get_user_or_404(db, record.user_id)


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

    user.last_login_at = datetime.now(UTC)
    await db.commit()

    await activity_service.log_account_activity(db, user, event_type="login", summary="Signed in")
    return await _create_token_pair(db, user)


async def refresh(db: AsyncSession, raw_refresh_token: str) -> TokenPair:
    result = await db.execute(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw_refresh_token),
            AuthToken.purpose == TokenPurpose.REFRESH,
        )
    )
    record = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if record is None or record.expires_at < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")

    # Rotation with a small reuse-grace window: a token that was just used is
    # still honoured (concurrent requests from the same session), but one used
    # longer ago is a genuine replay. On replay we don't just reject this
    # request — we revoke *every* refresh token for the account, so whether it
    # was the attacker or the real user who replayed, both are forced to log
    # in again and the stolen token becomes worthless.
    if record.used_at is not None:
        grace = timedelta(seconds=settings.refresh_token_reuse_grace_seconds)
        if now - record.used_at > grace:
            await db.execute(
                delete(AuthToken).where(AuthToken.user_id == record.user_id, AuthToken.purpose == TokenPurpose.REFRESH)
            )
            await db.commit()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    else:
        record.used_at = now
        await db.commit()

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


# Starts an email change: verifies the account's current password, then emails
# a confirmation link to the NEW address. The change only takes effect once
# that link is confirmed (see confirm_email_change) — never immediately —
# so a typo'd address can't silently lock the account out of its own inbox.
async def request_email_change(db: AsyncSession, user: User, *, current_password: str, new_email: str) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    if new_email == user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That's already your email address")
    if await get_user_by_email(db, new_email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    token = await _issue_token(db, user, TokenPurpose.EMAIL_CHANGE, new_email=new_email)
    send_email_change_email(to=new_email, token=token)
    await activity_service.log_account_activity(
        db, user, event_type="email_change_requested", summary=f"Requested an email change to {new_email}"
    )


async def get_email_change_target(db: AsyncSession, raw_token: str) -> str:
    """Resolves the pending new email address for a confirmation token without consuming it,
    so the confirm-email page can preview it before the user actually confirms."""
    record = await _peek_token(db, raw_token, TokenPurpose.EMAIL_CHANGE)
    assert record.new_email is not None  # invariant: always set when purpose is EMAIL_CHANGE
    return record.new_email


async def confirm_email_change(db: AsyncSession, raw_token: str) -> User:
    record = await _consume_token(db, raw_token, TokenPurpose.EMAIL_CHANGE)
    assert record.new_email is not None  # invariant: always set when purpose is EMAIL_CHANGE
    user = await _get_user_or_404(db, record.user_id)

    # Re-check uniqueness: another account could have claimed this address
    # after the token was issued but before it was confirmed.
    if await get_user_by_email(db, record.new_email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user.email = record.new_email
    await db.commit()
    await db.refresh(user)

    await activity_service.log_account_activity(
        db, user, event_type="email_change_confirmed", summary=f"Email address changed to {user.email}"
    )
    return user
