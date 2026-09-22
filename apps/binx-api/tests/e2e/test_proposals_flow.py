"""End-to-end: a staff member drafts a proposal, sends it, and the
unauthenticated recipient views and signs it through the public link — no
account or portal access required on their side."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest

from tests.conftest import auth_headers
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.e2e


def _token_from_share_url(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner)
    return agency, owner


async def _create_proposal(client, agency_id, owner) -> dict:
    resp = await client.post(
        f"/agencies/{agency_id}/proposals",
        json={
            "title": "Brand refresh",
            "recipient_name": "Jane Prospect",
            "recipient_email": "jane@example.com",
            "content": "We'll redesign your brand identity.",
            "currency": "USD",
            "tax_rate_percent": "0",
            "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 500000}],
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestProposalLifecycle:
    async def test_create_send_view_sign(self, client, ctx) -> None:
        agency, owner = ctx
        proposal = await _create_proposal(client, agency.id, owner)
        assert proposal["status"] == "draft"
        assert proposal["total_cents"] == 500000
        token = _token_from_share_url(proposal["share_url"])

        # A draft's public link doesn't resolve yet.
        pre_send = await client.get(f"/proposals/public/{token}")
        assert pre_send.status_code == 404

        send = await client.post(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/send", json={}, headers=auth_headers(owner)
        )
        assert send.status_code == 200, send.text
        assert send.json()["status"] == "sent"

        public_view = await client.get(f"/proposals/public/{token}")
        assert public_view.status_code == 200
        body = public_view.json()
        assert body["status"] == "viewed"  # flipped by the view itself
        assert body["agency_name"] == agency.name
        assert body["signature"] is None

        sign = await client.post(
            f"/proposals/public/{token}/sign", json={"signer_name": "Jane Prospect", "signer_email": "jane@example.com"}
        )
        assert sign.status_code == 200, sign.text
        assert sign.json()["status"] == "signed"
        assert sign.json()["signature"]["signer_email"] == "jane@example.com"

        # Staff-side read reflects the same state.
        staff_read = await client.get(f"/agencies/{agency.id}/proposals/{proposal['id']}", headers=auth_headers(owner))
        assert staff_read.json()["status"] == "signed"

    async def test_decline_via_public_link(self, client, ctx) -> None:
        agency, owner = ctx
        proposal = await _create_proposal(client, agency.id, owner)
        await client.post(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/send", json={}, headers=auth_headers(owner)
        )
        token = _token_from_share_url(proposal["share_url"])

        decline = await client.post(f"/proposals/public/{token}/decline", json={"reason": "Budget"})
        assert decline.status_code == 200
        assert decline.json()["status"] == "declined"

    async def test_wrong_token_is_404(self, client, ctx) -> None:
        resp = await client.get("/proposals/public/not-a-real-token")
        assert resp.status_code == 404

    async def test_list_and_delete_draft(self, client, ctx) -> None:
        agency, owner = ctx
        proposal = await _create_proposal(client, agency.id, owner)

        listed = await client.get(f"/agencies/{agency.id}/proposals", headers=auth_headers(owner))
        assert listed.status_code == 200
        assert any(p["id"] == proposal["id"] for p in listed.json())

        deleted = await client.delete(f"/agencies/{agency.id}/proposals/{proposal['id']}", headers=auth_headers(owner))
        assert deleted.status_code == 204
