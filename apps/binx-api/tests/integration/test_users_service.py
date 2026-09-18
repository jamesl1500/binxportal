"""
Integration tests for ``binx_api.modules.users.service`` — profile edits, the
lazily-created notification / privacy / profile / appearance settings rows,
password change, and account deletion (including its ON DELETE CASCADE reach).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.users import service
from binx_api.modules.users.models import (
    User,
    UserAppearanceSettings,
    UserNotificationSettings,
    UserPrivacySettings,
    UserProfile,
    UserTutorialProgress,
)
from tests.factories import make_user

pytestmark = pytest.mark.integration

PASSWORD = "the-current-password"
PNG = b"\x89PNG\r\n\x1a\nfake-bytes"


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "agency_upload_dir", str(tmp_path))


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
            inapp_meetings=False,
        )
        assert updated.email_product_updates is False
        assert updated.email_weekly_digest is True
        assert updated.inapp_invoicing is False
        assert updated.inapp_messages is False
        assert updated.inapp_meetings is False


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


class TestProfileImages:
    async def test_save_rejects_a_non_image(self, db_session) -> None:
        user = await make_user(db_session)
        with pytest.raises(HTTPException) as exc:
            await service.save_user_image(
                db_session, user, kind="avatar", content=b"not an image", mime_type="text/plain"
            )
        assert exc.value.status_code == 415

    async def test_save_rejects_an_oversize_image(self, db_session, monkeypatch) -> None:
        user = await make_user(db_session)
        monkeypatch.setattr(service.settings, "agency_image_max_bytes", 4)
        with pytest.raises(HTTPException) as exc:
            await service.save_user_image(db_session, user, kind="avatar", content=PNG, mime_type="image/png")
        assert exc.value.status_code == 413

    async def test_save_then_replace_then_clear(self, db_session) -> None:
        user = await make_user(db_session)
        profile = await service.save_user_image(db_session, user, kind="avatar", content=PNG, mime_type="image/png")
        first_path = profile.avatar_storage_path
        assert first_path is not None
        assert profile.avatar_mime_type == "image/png"

        profile = await service.save_user_image(
            db_session, user, kind="avatar", content=b"\x89PNG\r\n\x1a\nother", mime_type="image/webp"
        )
        assert profile.avatar_storage_path != first_path
        assert profile.avatar_mime_type == "image/webp"
        assert not Path(first_path).exists()

        profile = await service.clear_user_image(db_session, user, kind="avatar")
        assert profile.avatar_storage_path is None
        assert profile.avatar_mime_type is None

    async def test_cover_is_independent_of_avatar(self, db_session) -> None:
        user = await make_user(db_session)
        await service.save_user_image(db_session, user, kind="avatar", content=PNG, mime_type="image/png")
        profile = await service.save_user_image(db_session, user, kind="cover", content=PNG, mime_type="image/png")
        assert profile.avatar_storage_path is not None
        assert profile.cover_storage_path is not None
        assert profile.avatar_storage_path != profile.cover_storage_path


class TestQualifications:
    async def test_first_read_creates_a_default_row(self, db_session) -> None:
        user = await make_user(db_session)
        profile = await service.get_or_create_profile(db_session, user)
        assert service.profile_skills(profile) == []
        assert service.profile_experience(profile) == []
        assert service.profile_education(profile) == []

    async def test_update_replaces_all_three(self, db_session) -> None:
        user = await make_user(db_session)
        experience = [
            {
                "id": "exp-1",
                "title": "Senior Developer",
                "organization": "Acme Co.",
                "start_year": 2021,
                "end_year": None,
                "description": "Led the platform rewrite.",
            }
        ]
        education = [
            {
                "id": "edu-1",
                "school": "State University",
                "degree": "B.S. Computer Science",
                "field_of_study": None,
                "start_year": 2014,
                "end_year": 2018,
                "description": None,
            }
        ]
        profile = await service.update_qualifications(
            db_session, user, skills=["Python", "React"], experience=experience, education=education
        )
        assert service.profile_skills(profile) == ["Python", "React"]
        assert service.profile_experience(profile) == experience
        assert service.profile_education(profile) == education

        # A later update with an empty set actually clears it (full replace).
        profile = await service.update_qualifications(db_session, user, skills=[], experience=[], education=[])
        assert service.profile_skills(profile) == []
        assert service.profile_experience(profile) == []


class TestAppearanceSettings:
    async def test_first_read_creates_a_default_row(self, db_session) -> None:
        user = await make_user(db_session)
        settings_row = await service.get_or_create_appearance_settings(db_session, user)
        assert settings_row.accent_color is None

    async def test_update_sets_and_clears_the_accent_color(self, db_session) -> None:
        user = await make_user(db_session)
        updated = await service.update_appearance_settings(db_session, user, accent_color="#2563eb")
        assert updated.accent_color == "#2563eb"

        cleared = await service.update_appearance_settings(db_session, user, accent_color=None)
        assert cleared.accent_color is None


class TestTutorialProgress:
    async def test_first_read_creates_a_default_row(self, db_session) -> None:
        user = await make_user(db_session)
        rows = (await db_session.execute(select(UserTutorialProgress))).scalars().all()
        assert rows == []

        progress = await service.get_tutorial_progress(db_session, user)
        assert progress.tour_completed is False
        assert service.tutorial_dismissed_popups(progress) == []

        rows = (await db_session.execute(select(UserTutorialProgress))).scalars().all()
        assert len(rows) == 1

    async def test_second_read_reuses_the_same_row(self, db_session) -> None:
        user = await make_user(db_session)
        first = await service.get_tutorial_progress(db_session, user)
        second = await service.get_tutorial_progress(db_session, user)
        assert first.id == second.id

    async def test_update_replaces_completion_and_dismissed_popups(self, db_session) -> None:
        user = await make_user(db_session)
        updated = await service.update_tutorial_progress(
            db_session, user, tour_completed=True, dismissed_popups=["clients-new", "projects-new"]
        )
        assert updated.tour_completed is True
        assert service.tutorial_dismissed_popups(updated) == ["clients-new", "projects-new"]

        # A later update fully replaces the list, same as notification settings.
        replaced = await service.update_tutorial_progress(
            db_session, user, tour_completed=True, dismissed_popups=["clients-new"]
        )
        assert service.tutorial_dismissed_popups(replaced) == ["clients-new"]


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
        await service.get_or_create_profile(db_session, user)
        await service.get_or_create_appearance_settings(db_session, user)

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
        assert (
            await db_session.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        ).scalars().all() == []
        assert (
            await db_session.execute(select(UserAppearanceSettings).where(UserAppearanceSettings.user_id == user_id))
        ).scalars().all() == []

    async def test_deletes_the_users_uploaded_images_off_disk(self, db_session) -> None:
        user = await make_user(db_session, password=PASSWORD)
        profile = await service.save_user_image(db_session, user, kind="avatar", content=PNG, mime_type="image/png")
        avatar_path = Path(profile.avatar_storage_path)
        assert avatar_path.exists()

        await service.delete_account(db_session, user, current_password=PASSWORD)

        assert not avatar_path.exists()
