"""
End-to-end tests for the ``/agencies/{id}/conversations`` router.

The headline journey: start a group, send a message carrying two files, page
the history, download an attachment, mark the thread read, edit and delete a
message — and confirm a non-participant can't see any of it.
"""

from __future__ import annotations

import pytest

from binx_api.modules.agencies.models import ROLE_MEMBER, AgencyMember
from binx_api.modules.messaging import service
from tests.conftest import auth_headers
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.e2e

PNG = ("hero.png", b"\x89PNG\r\n\x1a\nfake", "image/png")
PDF = ("brief.pdf", b"%PDF-1.4 ...", "application/pdf")


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "message_upload_dir", str(tmp_path))


@pytest.fixture
async def team(db_session):
    alice = await make_user(db_session, full_name="Alice")
    bob = await make_user(db_session, full_name="Bob")
    agency = await make_agency(db_session, owner=alice)
    db_session.add(AgencyMember(agency_id=agency.id, user_id=bob.id, role=ROLE_MEMBER))
    await db_session.commit()
    return agency, alice, bob


class TestConversationJourney:
    async def test_group_message_with_files_round_trip(self, client, team) -> None:
        agency, alice, bob = team
        a, b = auth_headers(alice), auth_headers(bob)
        base = f"/agencies/{agency.id}/conversations"

        created = await client.post(
            base,
            json={"kind": "group", "title": "Launch", "participant_user_ids": [str(bob.id)]},
            headers=a,
        )
        assert created.status_code == 201
        conversation_id = created.json()["id"]
        assert {p["full_name"] for p in created.json()["participants"]} == {"Alice", "Bob"}

        sent = await client.post(
            f"{base}/{conversation_id}/messages",
            data={"body": "assets attached"},
            files=[("files", PNG), ("files", PDF)],
            headers=a,
        )
        assert sent.status_code == 201
        assert [att["file_name"] for att in sent.json()["attachments"]] == ["hero.png", "brief.pdf"]
        attachment_id = sent.json()["attachments"][0]["id"]
        message_id = sent.json()["id"]

        # Bob sees the conversation with one unread and can read the history.
        inbox = (await client.get(base, headers=b)).json()
        assert inbox[0]["id"] == conversation_id
        assert inbox[0]["unread_count"] == 1
        assert inbox[0]["title"] == "Launch"

        history = (await client.get(f"{base}/{conversation_id}/messages", headers=b)).json()
        assert [m["body"] for m in history] == ["assets attached"]

        download = await client.get(
            f"{base}/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/download", headers=b
        )
        assert download.status_code == 200
        assert download.content == PNG[1]

        assert (await client.post(f"{base}/{conversation_id}/read", headers=b)).status_code == 204
        assert (await client.get(base, headers=b)).json()[0]["unread_count"] == 0

        # Unread summary powers the nav badge.
        await client.post(f"{base}/{conversation_id}/messages", data={"body": "one more"}, headers=a)
        summary = await client.get(f"{base}/unread-summary", headers=b)
        assert summary.json()["unread_total"] == 1

    async def test_edit_and_delete_a_message(self, client, team) -> None:
        agency, alice, bob = team
        a = auth_headers(alice)
        base = f"/agencies/{agency.id}/conversations"
        conversation_id = (
            await client.post(
                base,
                json={"kind": "direct", "participant_user_ids": [str(bob.id)], "initial_message": "draft"},
                headers=a,
            )
        ).json()["id"]
        message_id = (await client.get(f"{base}/{conversation_id}/messages", headers=a)).json()[0]["id"]

        edited = await client.patch(
            f"{base}/{conversation_id}/messages/{message_id}", json={"body": "final"}, headers=a
        )
        assert edited.json()["body"] == "final"
        assert edited.json()["edited_at"] is not None

        assert (await client.delete(f"{base}/{conversation_id}/messages/{message_id}", headers=a)).status_code == 204
        history = (await client.get(f"{base}/{conversation_id}/messages", headers=a)).json()
        assert history[0]["deleted_at"] is not None
        assert history[0]["body"] == ""

    async def test_direct_conversation_title_is_the_other_person(self, client, team) -> None:
        agency, alice, bob = team
        base = f"/agencies/{agency.id}/conversations"
        created = await client.post(
            base, json={"kind": "direct", "participant_user_ids": [str(bob.id)]}, headers=auth_headers(alice)
        )
        assert created.json()["title"] == "Bob"
        # ...and from Bob's side it's Alice.
        mine = (await client.get(base, headers=auth_headers(bob))).json()
        assert mine[0]["title"] == "Alice"


class TestVisibility:
    async def test_a_non_participant_gets_404(self, client, team, db_session) -> None:
        agency, alice, bob = team
        base = f"/agencies/{agency.id}/conversations"
        conversation_id = (
            await client.post(
                base, json={"kind": "direct", "participant_user_ids": [str(bob.id)]}, headers=auth_headers(alice)
            )
        ).json()["id"]

        carol = await make_user(db_session)
        db_session.add(AgencyMember(agency_id=agency.id, user_id=carol.id, role=ROLE_MEMBER))
        await db_session.commit()

        # Carol is an agency member but not a participant.
        assert (await client.get(f"{base}/{conversation_id}", headers=auth_headers(carol))).status_code == 404
        assert (await client.get(f"{base}/{conversation_id}/messages", headers=auth_headers(carol))).status_code == 404
        assert (await client.get(base, headers=auth_headers(carol))).json() == []

    async def test_an_outsider_gets_404_on_the_agency(self, client, team, db_session) -> None:
        agency, _alice, _bob = team
        outsider = await make_user(db_session)
        response = await client.get(f"/agencies/{agency.id}/conversations", headers=auth_headers(outsider))
        assert response.status_code == 404
