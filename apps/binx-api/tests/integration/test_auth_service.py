"""
Integration tests for ``binx_api.modules.auth.service``.

Covers the four token journeys the module owns — signup + email verification,
login, refresh, password reset, and email change — including the failure
branches (wrong password, unverified/disabled account, reused or expired
token). All against a real Postgres test database.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.auth import service
from binx_api.modules.auth.models import AuthToken, TokenPurpose
from binx_api.modules.users.models import User
from binx_api.modules.users.service import get_user_by_email
from tests.conftest import extract_token
from tests.factories import make_user

pytestmark = pytest.mark.integration

PASSWORD = "a-good-enough-password"


async def _latest_token_row(db, user_id, purpose: TokenPurpose) -> AuthToken:
    """The most recently issued ``AuthToken`` row of a given purpose — for
    assertions on persisted state (``used_at``) or to age a token out by
    editing ``expires_at`` directly (the raw value can't be recovered from
    its hash)."""
    row = (
        (
            await db.execute(
                select(AuthToken)
                .where(AuthToken.user_id == user_id, AuthToken.purpose == purpose)
                .order_by(AuthToken.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    assert row is not None
    return row


class TestSignup:
    async def test_creates_an_unverified_user_and_sends_a_verification_email(self, db_session, email_outbox) -> None:
        user = await service.signup(
            db_session,
            user_name="newbie",
            email="newbie@example.com",
            full_name="New Bie",
            password=PASSWORD,
        )

        assert user.is_verified is False
        assert user.is_active is True
        assert len(email_outbox) == 1
        assert email_outbox[0].to == "newbie@example.com"
        # A single-use verification token was persisted.
        token_row = await _latest_token_row(db_session, user.id, TokenPurpose.EMAIL_VERIFICATION)
        assert token_row.used_at is None

    async def test_rejects_a_duplicate_email(self, db_session) -> None:
        await make_user(db_session, email="taken@example.com", user_name="first")
        with pytest.raises(HTTPException) as exc:
            await service.signup(
                db_session, user_name="second", email="taken@example.com", full_name="Dup", password=PASSWORD
            )
        assert exc.value.status_code == 409

    async def test_rejects_a_duplicate_username(self, db_session) -> None:
        await make_user(db_session, user_name="samename", email="one@example.com")
        with pytest.raises(HTTPException) as exc:
            await service.signup(
                db_session, user_name="samename", email="two@example.com", full_name="Dup", password=PASSWORD
            )
        assert exc.value.status_code == 409

    async def test_derives_a_username_from_the_email_when_none_is_supplied(self, db_session) -> None:
        # Signup no longer asks for a handle up front — omitting user_name is
        # the normal path now, not an edge case.
        user = await service.signup(
            db_session, user_name=None, email="Jordan.Rivera+test@example.com", full_name="Jordan", password=PASSWORD
        )
        assert user.user_name == "jordanriveratest"

    async def test_pads_a_short_email_local_part_to_meet_the_minimum_length(self, db_session) -> None:
        user = await service.signup(
            db_session, user_name=None, email="ab@example.com", full_name="AB", password=PASSWORD
        )
        assert user.user_name == "userab"

    async def test_de_duplicates_a_derived_username_with_a_numeric_suffix(self, db_session) -> None:
        await make_user(db_session, user_name="jordan", email="existing@example.com")
        await make_user(db_session, user_name="jordan2", email="existing2@example.com")

        user = await service.signup(
            db_session, user_name=None, email="jordan@another.example.com", full_name="Jordan Two", password=PASSWORD
        )
        assert user.user_name == "jordan3"


class TestEmailVerification:
    async def test_verifies_the_account_and_returns_a_token_pair(self, db_session, email_outbox) -> None:
        await service.signup(db_session, user_name="v", email="verify@example.com", full_name="V", password=PASSWORD)
        raw_token = extract_token(email_outbox[0].body)

        pair = await service.verify_email(db_session, raw_token)

        assert pair.access_token and pair.refresh_token
        user = await get_user_by_email(db_session, "verify@example.com")
        assert user.is_verified is True

    async def test_a_verification_token_is_single_use(self, db_session, email_outbox) -> None:
        await service.signup(db_session, user_name="v2", email="verify2@example.com", full_name="V", password=PASSWORD)
        raw_token = extract_token(email_outbox[0].body)
        await service.verify_email(db_session, raw_token)

        with pytest.raises(HTTPException) as exc:
            await service.verify_email(db_session, raw_token)
        assert exc.value.status_code == 400

    async def test_preview_resolves_the_email_without_consuming_the_token(self, db_session, email_outbox) -> None:
        await service.signup(db_session, user_name="v3", email="preview@example.com", full_name="V", password=PASSWORD)
        raw_token = extract_token(email_outbox[0].body)

        target = await service.get_email_verification_target(db_session, raw_token)
        assert target.email == "preview@example.com"
        # Still usable afterwards.
        await service.verify_email(db_session, raw_token)

    async def test_rejects_an_expired_token(self, db_session, email_outbox) -> None:
        await service.signup(db_session, user_name="v4", email="expired@example.com", full_name="V", password=PASSWORD)
        raw_token = extract_token(email_outbox[0].body)
        token_row = await _latest_token_row(
            db_session, (await get_user_by_email(db_session, "expired@example.com")).id, TokenPurpose.EMAIL_VERIFICATION
        )
        token_row.expires_at = datetime.now(UTC) - timedelta(hours=1)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await service.verify_email(db_session, raw_token)
        assert exc.value.status_code == 400

    async def test_resend_is_a_no_op_for_an_already_verified_account(self, db_session, email_outbox) -> None:
        await make_user(db_session, email="already@example.com", is_verified=True)
        await service.resend_verification(db_session, "already@example.com")
        assert email_outbox == []

    async def test_resend_is_silent_for_an_unknown_email(self, db_session, email_outbox) -> None:
        await service.resend_verification(db_session, "nobody@example.com")
        assert email_outbox == []


class TestLogin:
    async def test_succeeds_for_a_verified_active_user(self, db_session) -> None:
        await make_user(db_session, email="login@example.com", password=PASSWORD, is_verified=True)
        pair = await service.login(db_session, "login@example.com", PASSWORD)
        assert pair.access_token and pair.refresh_token

    async def test_records_last_login(self, db_session) -> None:
        user = await make_user(db_session, email="lastlogin@example.com", password=PASSWORD)
        assert user.last_login_at is None
        await service.login(db_session, "lastlogin@example.com", PASSWORD)
        await db_session.refresh(user)
        assert user.last_login_at is not None

    async def test_rejects_a_wrong_password(self, db_session) -> None:
        await make_user(db_session, email="wrongpw@example.com", password=PASSWORD)
        with pytest.raises(HTTPException) as exc:
            await service.login(db_session, "wrongpw@example.com", "nope")
        assert exc.value.status_code == 401

    async def test_rejects_an_unknown_email_with_the_same_401(self, db_session) -> None:
        with pytest.raises(HTTPException) as exc:
            await service.login(db_session, "ghost@example.com", PASSWORD)
        assert exc.value.status_code == 401

    async def test_rejects_an_unverified_account(self, db_session) -> None:
        await make_user(db_session, email="unverified@example.com", password=PASSWORD, is_verified=False)
        with pytest.raises(HTTPException) as exc:
            await service.login(db_session, "unverified@example.com", PASSWORD)
        assert exc.value.status_code == 403

    async def test_rejects_a_disabled_account(self, db_session) -> None:
        await make_user(db_session, email="disabled@example.com", password=PASSWORD, is_active=False)
        with pytest.raises(HTTPException) as exc:
            await service.login(db_session, "disabled@example.com", PASSWORD)
        assert exc.value.status_code == 403


class TestRefresh:
    async def test_exchanges_a_refresh_token_for_a_new_pair(self, db_session) -> None:
        await make_user(db_session, email="refresh@example.com", password=PASSWORD)
        first = await service.login(db_session, "refresh@example.com", PASSWORD)
        second = await service.refresh(db_session, first.refresh_token)
        assert second.refresh_token != first.refresh_token

    async def test_a_refresh_token_cannot_be_replayed_after_the_grace_window(self, db_session, monkeypatch) -> None:
        monkeypatch.setattr(service.settings, "refresh_token_reuse_grace_seconds", 0)
        await make_user(db_session, email="replay@example.com", password=PASSWORD)
        pair = await service.login(db_session, "replay@example.com", PASSWORD)
        await service.refresh(db_session, pair.refresh_token)
        with pytest.raises(HTTPException) as exc:
            await service.refresh(db_session, pair.refresh_token)
        assert exc.value.status_code == 400

    async def test_a_just_used_refresh_token_is_still_honoured_within_the_grace_window(self, db_session) -> None:
        # Two near-simultaneous requests from the same session both present the
        # same refresh token — neither should be knocked out.
        await make_user(db_session, email="grace@example.com", password=PASSWORD)
        pair = await service.login(db_session, "grace@example.com", PASSWORD)
        first = await service.refresh(db_session, pair.refresh_token)
        second = await service.refresh(db_session, pair.refresh_token)  # within grace
        assert first.access_token and second.access_token

    async def test_rejects_refresh_for_a_disabled_account(self, db_session) -> None:
        user = await make_user(db_session, email="refreshdisabled@example.com", password=PASSWORD)
        pair = await service.login(db_session, "refreshdisabled@example.com", PASSWORD)
        user.is_active = False
        await db_session.commit()
        with pytest.raises(HTTPException) as exc:
            await service.refresh(db_session, pair.refresh_token)
        assert exc.value.status_code == 403


class TestPasswordReset:
    async def test_full_flow_updates_the_hash(self, db_session, email_outbox) -> None:
        await make_user(db_session, email="reset@example.com", password=PASSWORD)
        await service.request_password_reset(db_session, "reset@example.com")
        raw_token = extract_token(email_outbox[0].body)

        await service.reset_password(db_session, raw_token, "a-brand-new-password")

        # Old password no longer works; new one does.
        with pytest.raises(HTTPException):
            await service.login(db_session, "reset@example.com", PASSWORD)
        pair = await service.login(db_session, "reset@example.com", "a-brand-new-password")
        assert pair.access_token

    async def test_request_is_silent_for_an_unknown_email(self, db_session, email_outbox) -> None:
        await service.request_password_reset(db_session, "nobody@example.com")
        assert email_outbox == []

    async def test_reset_token_is_single_use(self, db_session, email_outbox) -> None:
        await make_user(db_session, email="reset2@example.com", password=PASSWORD)
        await service.request_password_reset(db_session, "reset2@example.com")
        raw_token = extract_token(email_outbox[0].body)
        await service.reset_password(db_session, raw_token, "new-password-one")
        with pytest.raises(HTTPException) as exc:
            await service.reset_password(db_session, raw_token, "new-password-two")
        assert exc.value.status_code == 400


class TestEmailChange:
    async def test_full_flow_swaps_the_address_only_after_confirmation(self, db_session, email_outbox) -> None:
        user = await make_user(db_session, email="old@example.com", password=PASSWORD)

        await service.request_email_change(db_session, user, current_password=PASSWORD, new_email="new@example.com")
        # Not changed yet — the confirmation link was sent to the NEW address.
        await db_session.refresh(user)
        assert user.email == "old@example.com"
        assert email_outbox[0].to == "new@example.com"

        raw_token = extract_token(email_outbox[0].body)
        assert await service.get_email_change_target(db_session, raw_token) == "new@example.com"

        updated = await service.confirm_email_change(db_session, raw_token)
        assert updated.email == "new@example.com"

    async def test_rejects_a_wrong_current_password(self, db_session) -> None:
        user = await make_user(db_session, email="change-wrongpw@example.com", password=PASSWORD)
        with pytest.raises(HTTPException) as exc:
            await service.request_email_change(db_session, user, current_password="wrong", new_email="x@example.com")
        assert exc.value.status_code == 401

    async def test_rejects_changing_to_your_current_address(self, db_session) -> None:
        user = await make_user(db_session, email="same@example.com", password=PASSWORD)
        with pytest.raises(HTTPException) as exc:
            await service.request_email_change(
                db_session, user, current_password=PASSWORD, new_email="same@example.com"
            )
        assert exc.value.status_code == 400

    async def test_rejects_changing_to_an_address_already_registered(self, db_session) -> None:
        await make_user(db_session, email="occupied@example.com")
        user = await make_user(db_session, email="mover@example.com", password=PASSWORD)
        with pytest.raises(HTTPException) as exc:
            await service.request_email_change(
                db_session, user, current_password=PASSWORD, new_email="occupied@example.com"
            )
        assert exc.value.status_code == 409

    async def test_confirmation_rechecks_uniqueness_at_confirm_time(self, db_session, email_outbox) -> None:
        # Address is free when the token is issued, taken by the time it's confirmed.
        user = await make_user(db_session, email="racer@example.com", password=PASSWORD)
        await service.request_email_change(
            db_session, user, current_password=PASSWORD, new_email="contested@example.com"
        )
        raw_token = extract_token(email_outbox[0].body)
        await make_user(db_session, email="contested@example.com", user_name="claimjumper")

        with pytest.raises(HTTPException) as exc:
            await service.confirm_email_change(db_session, raw_token)
        assert exc.value.status_code == 409
