"""
Regression: a client invited at a plus-addressed email ("hello+client@…")
must be able to sign up with that exact address and accept the invitation.
"""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers, extract_token
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.e2e

PLUS_EMAIL = "hello+client@northwind.example"


@pytest.fixture
async def setup(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner", email="olivia@agency.example")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    client_ = await make_client(db_session, agency=agency, name="Northwind Traders")
    return owner, agency, client_


async def test_plus_addressed_invite_survives_the_real_signup_and_accept(client, db_session, email_outbox, setup):
    owner, agency, client_ = setup

    invite = await client.post(
        f"/agencies/{agency.id}/clients/{client_.id}/contacts/invitations",
        json={"email": PLUS_EMAIL},
        headers=auth_headers(owner),
    )
    assert invite.status_code == 201, invite.text
    invite_token = extract_token(email_outbox[-1].body)

    preview = await client.get("/portal/invitations/preview", params={"token": invite_token})
    assert preview.status_code == 200, preview.text
    assert preview.json()["email"] == PLUS_EMAIL

    signup = await client.post(
        "/auth/signup",
        json={
            "email": PLUS_EMAIL,
            "full_name": "Casey Client",
            "password": "Sup3r-secret-pass!",
            "portal_invite_token": invite_token,
        },
    )
    assert signup.status_code == 201, signup.text
    assert signup.json()["user"]["email"] == PLUS_EMAIL

    verify_token = extract_token(email_outbox[-1].body)
    info = await client.get("/auth/verify-email", params={"token": verify_token})
    assert info.status_code == 200, info.text
    verified = await client.post("/auth/verify-email", json={"token": verify_token})
    assert verified.status_code == 200, verified.text

    login = await client.post("/auth/login", json={"email": PLUS_EMAIL, "password": "Sup3r-secret-pass!"})
    assert login.status_code == 200, login.text
    access = login.json()["access_token"]

    accept = await client.post(
        "/portal/invitations/accept",
        json={"token": invite_token},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert accept.status_code == 200, accept.text
    assert accept.json()["contact"]["email"] == PLUS_EMAIL
