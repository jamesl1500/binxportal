"""
End-to-end tests for the ``/auth`` router — the full "sign up, verify, log in,
use the API, refresh" journey over HTTP, plus the guard rails on each step.

The ``email_outbox`` fixture captures the verification / reset links so the
test can follow them the way a user's inbox would.
"""

from __future__ import annotations

import pytest

from tests.conftest import DEFAULT_PASSWORD, extract_token
from tests.factories import make_user

pytestmark = pytest.mark.e2e

SIGNUP_BODY = {
    "user_name": "journey",
    "email": "journey@example.com",
    "full_name": "Journey Person",
    "password": "journey-password-1",
}


class TestSignupToFirstRequest:
    async def test_the_happy_path(self, client, email_outbox) -> None:
        # 1. Sign up.
        signup = await client.post("/auth/signup", json=SIGNUP_BODY)
        assert signup.status_code == 201
        assert signup.json()["user"]["email"] == "journey@example.com"
        assert signup.json()["user"]["is_verified"] is False

        # 2. Can't log in yet — not verified.
        early_login = await client.post(
            "/auth/login", json={"email": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]}
        )
        assert early_login.status_code == 403

        # 3. Follow the verification link from the "inbox".
        token = extract_token(email_outbox[0].body)
        preview = await client.get("/auth/verify-email", params={"token": token})
        assert preview.json() == {"email": "journey@example.com"}
        verify = await client.post("/auth/verify-email", json={"token": token})
        assert verify.status_code == 200
        assert verify.json()["access_token"]

        # 4. Now log in and call an authenticated endpoint.
        login = await client.post(
            "/auth/login", json={"email": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]}
        )
        assert login.status_code == 200
        access_token = login.json()["access_token"]

        me = await client.get("/users/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me.status_code == 200
        assert me.json()["user_name"] == "journey"

        # 5. Refresh swaps the refresh token for a new pair.
        refresh = await client.post("/auth/refresh", json={"refresh_token": login.json()["refresh_token"]})
        assert refresh.status_code == 200
        assert refresh.json()["refresh_token"] != login.json()["refresh_token"]

    async def test_signup_rejects_a_short_password(self, client) -> None:
        response = await client.post("/auth/signup", json={**SIGNUP_BODY, "password": "short"})
        assert response.status_code == 422

    async def test_signup_rejects_a_malformed_email(self, client) -> None:
        response = await client.post("/auth/signup", json={**SIGNUP_BODY, "email": "not-an-email"})
        assert response.status_code == 422

    async def test_signup_conflicts_on_a_duplicate_email(self, client, db_session) -> None:
        await make_user(db_session, email="dupe@example.com", user_name="already-here")
        response = await client.post("/auth/signup", json={**SIGNUP_BODY, "email": "dupe@example.com"})
        assert response.status_code == 409


class TestAuthErrors:
    async def test_missing_bearer_token_is_401(self, client) -> None:
        assert (await client.get("/users/me")).status_code == 401

    async def test_garbage_bearer_token_is_401(self, client) -> None:
        response = await client.get("/users/me", headers={"Authorization": "Bearer not.a.real.jwt"})
        assert response.status_code == 401

    async def test_login_wrong_password_is_401(self, client, user) -> None:
        response = await client.post("/auth/login", json={"email": user.email, "password": "wrong"})
        assert response.status_code == 401


class TestPasswordReset:
    async def test_forgot_then_reset_then_login(self, client, user, email_outbox) -> None:
        forgot = await client.post("/auth/forgot-password", json={"email": user.email})
        assert forgot.status_code == 200  # always 200, even for unknown emails

        token = extract_token(email_outbox[0].body)
        reset = await client.post("/auth/reset-password", json={"token": token, "new_password": "brand-new-password-9"})
        assert reset.status_code == 200

        login = await client.post("/auth/login", json={"email": user.email, "password": "brand-new-password-9"})
        assert login.status_code == 200

    async def test_forgot_password_does_not_leak_whether_the_account_exists(self, client, email_outbox) -> None:
        response = await client.post("/auth/forgot-password", json={"email": "nobody-here@example.com"})
        assert response.status_code == 200
        assert email_outbox == []


class TestEmailChange:
    async def test_change_email_requires_the_current_password(self, auth_client) -> None:
        response = await auth_client.post(
            "/auth/change-email", json={"current_password": "wrong", "new_email": "next@example.com"}
        )
        assert response.status_code == 401

    async def test_change_email_flow(self, auth_client, client, user, email_outbox) -> None:
        started = await auth_client.post(
            "/auth/change-email",
            json={"current_password": DEFAULT_PASSWORD, "new_email": "moved@example.com"},
        )
        assert started.status_code == 200

        token = extract_token(email_outbox[0].body)
        info = await client.get("/auth/confirm-email", params={"token": token})
        assert info.json() == {"new_email": "moved@example.com"}

        confirmed = await client.post("/auth/confirm-email", json={"token": token})
        assert confirmed.status_code == 200

        # The old address no longer logs in; the new one does.
        assert (
            await client.post("/auth/login", json={"email": "alice@example.com", "password": DEFAULT_PASSWORD})
        ).status_code == 401
        assert (
            await client.post("/auth/login", json={"email": "moved@example.com", "password": DEFAULT_PASSWORD})
        ).status_code == 200
