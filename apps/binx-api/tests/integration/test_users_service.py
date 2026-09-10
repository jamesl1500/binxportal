"""
Integration tests for ``binx_api.modules.users.service`` — profile edits, the
lazily-created notification / privacy settings rows, password change, and
account deletion (including its ON DELETE CASCADE reach).
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.users import service
from binx_api.modules.users.models import User, UserNotificationSettings, UserPrivacySettings
from tests.factories import make_user

pytestmark = pytest.mark.integration

PASSWORD = "the-current-password"


class TestProfileUpdate:
    async def test_updates_only_the_fields_provided(self, db_session) -> None:
        user = await make_user(db_session, full_name="Original Name")
        user.job_title = "Engineer"
        await db_session.commit()

        updated = await service.update_user_profile(db_session, user, full_name="New Name", summary="Hi there")

        assert updated.full_name == "New Name"
        assert updated.summary == "Hi there"
        assert updated.job_title == "Engineer"  # untouched — not passed

    async def test_passing_nothing_is_a_no_op(self, db_session) -> None:
        user = await make_user(db_session, full_name="Stable")
        updated = await service.update_user_profile(db_session, user)
        assert updated.full_name == "Stable"


class TestNotificationSettings:
    async def test_first_read_creates_a_default_row(self, db_session) -> None:
        user = await make_user(db_session)
        rows = (await db_session.execute(select(UserNotificationSettings))).scalars().all()
        assert rows == []

        settings = await service.get_notification_settings(db_session, user)
        assert settings.email_product_updates is True
        assert settings.email_weekly_digest is False

        rows = (await db_session.execute(select(UserNotificationSettings))).scalars().all()
        assert len(rows) == 1

    async def test_second_read_reuses_the_same_row(self, db_session) -> None:
        user = await make_user(db_session)
        first = await service.get_notification_settings(db_session, user)
        second = await service.get_notification_settings(db_session, user)
        assert first.id == second.id

    async def test_update_replaces_every_toggle(self, db_session) -> None:
        user = await make_user(db_session)
        updated = await service.update_notification_settings(
            db_session,
            user,
            email_product_updates=False,
            email_client_activity=False,
            email_team_mentions=False,
            email_weekly_digest=True,
            email_security_alerts=False,
            inapp_team=True,
            inapp_invoicing=False,
            inapp_projects=True,
            inapp_messages=False,
        )
        assert updated.email_product_updates is False
        assert updated.email_weekly_digest is True
        assert updated.inapp_invoicing is False
        assert updated.inapp_messages is False


class TestPrivacySettings:
    async def test_first_read_creates_a_default_row(self, db_session) -> None:
        user = await make_user(db_session)
        settings = await service.get_privacy_settings(db_session, user)
        assert settings.profile_visibility == "team"
        assert settings.show_phone_to_team is False

    async def test_update_replaces_every_field(self, db_session) -> None:
        user = await make_user(db_session)
        updated = await service.update_privacy_settings(
            db_session,
            user,
            profile_visibility="private",
            show_email_to_team=False,
            show_phone_to_team=True,
            activity_status_visible=False,
            analytics_opt_out=True,
        )
        assert updated.profile_visibility == "private"
        assert updated.analytics_opt_out is True


class TestChangePassword:
    async def test_changes_the_password_when_the_current_one_is_right(self, db_session) -> None:
        from binx_api.core.security import verify_password

        user = await make_user(db_session, password=PASSWORD)
        await service.change_password(db_session, user, current_password=PASSWORD, new_password="a-fresh-password")
        await db_session.refresh(user)
        assert verify_password("a-fresh-password", user.hashed_password)

    async def test_rejects_a_wrong_current_password(self, db_session) -> None:
        user = await make_user(db_session, password=PASSWORD)
        with pytest.raises(HTTPException) as exc:
            await service.change_password(db_session, user, current_password="wrong", new_password="whatever-123")
        assert exc.value.status_code == 401


class TestDeleteAccount:
    async def test_rejects_a_wrong_current_password(self, db_session) -> None:
        user = await make_user(db_session, password=PASSWORD)
        with pytest.raises(HTTPException) as exc:
            await service.delete_account(db_session, user, current_password="wrong")
        assert exc.value.status_code == 401

    async def test_deletes_the_user_and_cascades_to_settings_rows(self, db_session) -> None:
        user = await make_user(db_session, password=PASSWORD)
        user_id = user.id
        await service.get_notification_settings(db_session, user)
        await service.get_privacy_settings(db_session, user)

        await service.delete_account(db_session, user, current_password=PASSWORD)

        assert (await db_session.get(User, user_id)) is None
        assert (
            await db_session.execute(
                select(UserNotificationSettings).where(UserNotificationSettings.user_id == user_id)
            )
        ).scalars().all() == []
        assert (
            await db_session.execute(select(UserPrivacySettings).where(UserPrivacySettings.user_id == user_id))
        ).scalars().all() == []
