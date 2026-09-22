"""
End-to-end tests for the ``/users/me`` router — profile, settings, password,
and account deletion, all as the signed-in user.
"""

from __future__ import annotations

import pytest

from binx_api.modules.users import service
from tests.conftest import DEFAULT_PASSWORD

pytestmark = pytest.mark.e2e

PNG = ("avatar.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "agency_upload_dir", str(tmp_path))


async def test_read_me_returns_the_current_user(auth_client, user) -> None:
    response = await auth_client.get("/users/me")
    assert response.status_code == 200
    assert response.json()["email"] == user.email


async def test_patch_me_updates_the_profile(auth_client) -> None:
    response = await auth_client.patch("/users/me", json={"full_name": "Alice Renamed", "job_title": "Founder"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "Alice Renamed"
    assert response.json()["job_title"] == "Founder"


async def test_patch_me_validates_field_limits(auth_client) -> None:
    response = await auth_client.patch("/users/me", json={"full_name": ""})
    assert response.status_code == 422


class TestSettings:
    async def test_notification_settings_get_then_put(self, auth_client) -> None:
        initial = await auth_client.get("/users/me/notification-settings")
        assert initial.status_code == 200
        assert initial.json()["email_product_updates"] is True

        assert initial.json()["inapp_projects"] is True
        assert initial.json()["inapp_meetings"] is True

        updated = await auth_client.put(
            "/users/me/notification-settings",
            json={
                "email_product_updates": False,
                "email_client_activity": True,
                "email_team_mentions": True,
                "email_weekly_digest": True,
                "email_security_alerts": True,
                "inapp_team": True,
                "inapp_invoicing": False,
                "inapp_projects": True,
                "inapp_messages": False,
                "inapp_meetings": False,
            },
        )
        assert updated.json()["email_product_updates"] is False
        assert updated.json()["email_weekly_digest"] is True
        assert updated.json()["inapp_invoicing"] is False
        assert updated.json()["inapp_meetings"] is False

    async def test_privacy_settings_get_then_put(self, auth_client) -> None:
        assert (await auth_client.get("/users/me/privacy-settings")).json()["profile_visibility"] == "team"

        updated = await auth_client.put(
            "/users/me/privacy-settings",
            json={
                "profile_visibility": "private",
                "show_email_to_team": False,
                "show_phone_to_team": True,
                "activity_status_visible": False,
                "analytics_opt_out": True,
            },
        )
        assert updated.json()["profile_visibility"] == "private"

    async def test_privacy_settings_rejects_an_unknown_visibility(self, auth_client) -> None:
        response = await auth_client.put(
            "/users/me/privacy-settings",
            json={
                "profile_visibility": "public",  # not team|private
                "show_email_to_team": True,
                "show_phone_to_team": True,
                "activity_status_visible": True,
                "analytics_opt_out": False,
            },
        )
        assert response.status_code == 422


class TestQualifications:
    async def test_read_then_update_qualifications(self, auth_client) -> None:
        initial = await auth_client.get("/users/me/profile")
        assert initial.status_code == 200
        assert initial.json() == {
            "has_avatar": False,
            "avatar_version": None,
            "has_cover": False,
            "cover_version": None,
            "skills": [],
            "experience": [],
            "education": [],
        }

        updated = await auth_client.patch(
            "/users/me/qualifications",
            json={
                "skills": ["Python", "React"],
                "experience": [
                    {
                        "id": "exp-1",
                        "title": "Senior Developer",
                        "organization": "Acme Co.",
                        "start_year": 2021,
                        "end_year": None,
                        "description": "Led the platform rewrite.",
                    }
                ],
                "education": [
                    {
                        "id": "edu-1",
                        "school": "State University",
                        "degree": "B.S. Computer Science",
                        "field_of_study": None,
                        "start_year": 2014,
                        "end_year": 2018,
                        "description": None,
                    }
                ],
            },
        )
        assert updated.status_code == 200
        assert updated.json()["skills"] == ["Python", "React"]
        assert updated.json()["experience"][0]["title"] == "Senior Developer"
        assert updated.json()["experience"][0]["end_year"] is None
        assert updated.json()["education"][0]["school"] == "State University"

    async def test_rejects_too_many_skills(self, auth_client) -> None:
        response = await auth_client.patch(
            "/users/me/qualifications",
            json={"skills": [f"skill-{i}" for i in range(41)], "experience": [], "education": []},
        )
        assert response.status_code == 422


class TestPhotos:
    async def test_avatar_upload_download_delete(self, auth_client) -> None:
        assert (await auth_client.get("/users/me/avatar")).status_code == 404

        uploaded = await auth_client.put("/users/me/avatar", files={"file": PNG})
        assert uploaded.status_code == 200
        assert uploaded.json()["has_avatar"] is True
        assert uploaded.json()["avatar_version"] is not None

        got = await auth_client.get("/users/me/avatar")
        assert got.status_code == 200
        assert got.headers["content-type"] == "image/png"

        cleared = await auth_client.delete("/users/me/avatar")
        assert cleared.status_code == 200
        assert cleared.json()["has_avatar"] is False
        assert (await auth_client.get("/users/me/avatar")).status_code == 404

    async def test_cover_upload_is_independent_of_avatar(self, auth_client) -> None:
        await auth_client.put("/users/me/avatar", files={"file": PNG})
        uploaded = await auth_client.put("/users/me/cover", files={"file": PNG})
        assert uploaded.status_code == 200
        assert uploaded.json()["has_avatar"] is True
        assert uploaded.json()["has_cover"] is True

    async def test_rejects_a_disallowed_file_type(self, auth_client) -> None:
        response = await auth_client.put("/users/me/avatar", files={"file": ("notes.txt", b"hello", "text/plain")})
        assert response.status_code == 415


class TestAppearance:
    async def test_read_then_update_accent_color(self, auth_client) -> None:
        initial = await auth_client.get("/users/me/appearance")
        assert initial.status_code == 200
        assert initial.json()["accent_color"] is None

        updated = await auth_client.put("/users/me/appearance", json={"accent_color": "#2563eb"})
        assert updated.status_code == 200
        assert updated.json()["accent_color"] == "#2563eb"

    async def test_rejects_a_bad_hex_color(self, auth_client) -> None:
        response = await auth_client.put("/users/me/appearance", json={"accent_color": "blue"})
        assert response.status_code == 422


class TestDashboardLayout:
    async def test_read_returns_the_default_layout(self, auth_client) -> None:
        from binx_api.modules.users.schemas import DASHBOARD_WIDGET_IDS

        response = await auth_client.get("/users/me/dashboard-layout")
        assert response.status_code == 200
        assert response.json() == {"widget_order": DASHBOARD_WIDGET_IDS, "hidden_widgets": []}

    async def test_put_replaces_order_and_hidden_widgets(self, auth_client) -> None:
        from binx_api.modules.users.schemas import DASHBOARD_WIDGET_IDS

        custom_order = list(reversed(DASHBOARD_WIDGET_IDS))
        response = await auth_client.put(
            "/users/me/dashboard-layout",
            json={"widget_order": custom_order, "hidden_widgets": ["quick_actions"]},
        )
        assert response.status_code == 200
        assert response.json() == {"widget_order": custom_order, "hidden_widgets": ["quick_actions"]}

        # It persists — a fresh GET reflects it, not just the PUT response.
        follow_up = await auth_client.get("/users/me/dashboard-layout")
        assert follow_up.json()["widget_order"] == custom_order

    async def test_rejects_an_unknown_widget_id(self, auth_client) -> None:
        response = await auth_client.put(
            "/users/me/dashboard-layout", json={"widget_order": ["not_a_real_widget"], "hidden_widgets": []}
        )
        assert response.status_code == 422

    async def test_rejects_a_duplicate_widget_id(self, auth_client) -> None:
        response = await auth_client.put(
            "/users/me/dashboard-layout",
            json={"widget_order": ["my_tasks", "my_tasks"], "hidden_widgets": []},
        )
        assert response.status_code == 422


class TestCredentialChanges:
    async def test_change_password_requires_the_current_one(self, auth_client) -> None:
        wrong = await auth_client.patch(
            "/users/me/password", json={"current_password": "nope", "new_password": "a-new-password-1"}
        )
        assert wrong.status_code == 401

        ok = await auth_client.patch(
            "/users/me/password",
            json={"current_password": DEFAULT_PASSWORD, "new_password": "a-new-password-1"},
        )
        assert ok.status_code == 200

    async def test_delete_account_requires_the_password_then_revokes_access(self, auth_client) -> None:
        # DELETE /users/me carries a body, so it goes through `.request`.
        wrong = await auth_client.request("DELETE", "/users/me", json={"current_password": "wrong"})
        assert wrong.status_code == 401

        deleted = await auth_client.request("DELETE", "/users/me", json={"current_password": DEFAULT_PASSWORD})
        assert deleted.status_code == 200
        # The token now points at a user that no longer exists.
        assert (await auth_client.get("/users/me")).status_code == 401
