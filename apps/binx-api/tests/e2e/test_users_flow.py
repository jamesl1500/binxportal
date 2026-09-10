"""
End-to-end tests for the ``/users/me`` router — profile, settings, password,
and account deletion, all as the signed-in user.
"""

from __future__ import annotations

import pytest

from tests.conftest import DEFAULT_PASSWORD

pytestmark = pytest.mark.e2e


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
            },
        )
        assert updated.json()["email_product_updates"] is False
        assert updated.json()["email_weekly_digest"] is True
        assert updated.json()["inapp_invoicing"] is False

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
