"""
Integration tests for ``binx_api.modules.messaging.service`` — conversation
creation and the participant/read/soft-delete rules, against a real database.
The websocket fan-out is exercised separately (``tests/unit/test_messaging_realtime.py``
and ``tests/e2e/test_messaging_ws.py``); ``realtime.manager`` with no
connected sockets is simply a no-op here.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER
from binx_api.modules.messaging import service
from binx_api.modules.messaging.models import KIND_DIRECT, KIND_GROUP, MESSAGE_SYSTEM
from tests.factories import (
    add_agency_member,
    make_agency,
    make_conversation,
    make_user,
    send_message,
)

pytestmark = pytest.mark.integration


@pytest.fixture
async def team(db_session):
    """An agency with three members: owner ``alice`` and members ``bob`` / ``carol``."""
    alice = await make_user(db_session, full_name="Alice")
    bob = await make_user(db_session, full_name="Bob")
    carol = await make_user(db_session, full_name="Carol")
    agency = await make_agency(db_session, owner=alice)
    await add_agency_member(db_session, agency=agency, user=bob)
    await add_agency_member(db_session, agency=agency, user=carol)
    return agency, alice, bob, carol


class TestCreateConversation:
    async def test_direct_is_idempotent(self, db_session, team) -> None:
        agency, alice, bob, _carol = team
        first = await service.create_conversation(
            db_session,
            agency,
            creator=alice,
            kind=KIND_DIRECT,
            title=None,
            participant_user_ids=[bob.id],
            client_id=None,
            project_id=None,
            initial_message="hi",
        )
        again = await service.create_conversation(
            db_session,
            agency,
            creator=alice,
            kind=KIND_DIRECT,
            title=None,
            participant_user_ids=[bob.id],
            client_id=None,
            project_id=None,
            initial_message="hello again",
        )
        assert again.id == first.id

    async def test_rejects_a_non_member(self, db_session, team) -> None:
        agency, alice, _bob, _carol = team
        outsider = await make_user(db_session, full_name="Outsider")
        with pytest.raises(HTTPException) as exc:
            await service.create_conversation(
                db_session,
                agency,
                creator=alice,
                kind=KIND_GROUP,
                title="x",
                participant_user_ids=[outsider.id],
                client_id=None,
                project_id=None,
                initial_message=None,
            )
        assert exc.value.status_code == 400

    async def test_direct_needs_exactly_one_other(self, db_session, team) -> None:
        agency, alice, bob, carol = team
        with pytest.raises(HTTPException) as exc:
            await service.create_conversation(
                db_session,
                agency,
                creator=alice,
                kind=KIND_DIRECT,
                title=None,
                participant_user_ids=[bob.id, carol.id],
                client_id=None,
                project_id=None,
                initial_message=None,
            )
        assert exc.value.status_code == 400

    async def test_initial_message_bumps_last_message_at(self, db_session, team) -> None:
        agency, alice, bob, _carol = team
        conversation = await make_conversation(
            db_session, agency=agency, creator=alice, others=[bob], initial_message="kickoff"
        )
        await db_session.refresh(conversation)
        assert conversation.last_message_at is not None


class TestUnreadCounts:
    async def test_counts_only_others_messages_after_last_read(self, db_session, team) -> None:
        agency, alice, bob, _carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])

        await send_message(db_session, conversation=conversation, sender=bob, body="one")
        await send_message(db_session, conversation=conversation, sender=bob, body="two")
        await send_message(db_session, conversation=conversation, sender=alice, body="mine")

        rows = await service.list_conversations(db_session, agency, alice)
        assert rows[0]["unread_count"] == 2  # bob's two, not alice's own

        _conv, participant = await service.get_conversation_for_participant_or_404(
            db_session, agency.id, conversation.id, alice
        )
        await service.mark_read(db_session, conversation, participant)
        rows = await service.list_conversations(db_session, agency, alice)
        assert rows[0]["unread_count"] == 0


class TestParticipants:
    async def test_add_then_leave_hides_the_conversation(self, db_session, team) -> None:
        agency, alice, bob, carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])

        await service.add_participants(db_session, conversation, alice, user_ids=[carol.id])
        rows = await service.list_conversations(db_session, agency, carol)
        assert [r["id"] for r in rows] == [conversation.id]

        await service.remove_participant(db_session, conversation, carol, target_user_id=carol.id)
        rows = await service.list_conversations(db_session, agency, carol)
        assert rows == []

    async def test_cannot_add_to_a_direct(self, db_session, team) -> None:
        agency, alice, bob, carol = team
        direct = await service.create_conversation(
            db_session,
            agency,
            creator=alice,
            kind=KIND_DIRECT,
            title=None,
            participant_user_ids=[bob.id],
            client_id=None,
            project_id=None,
            initial_message=None,
        )
        with pytest.raises(HTTPException) as exc:
            await service.add_participants(db_session, direct, alice, user_ids=[carol.id])
        assert exc.value.status_code == 409

    async def test_adding_writes_a_system_message(self, db_session, team) -> None:
        agency, alice, bob, carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])
        await service.add_participants(db_session, conversation, alice, user_ids=[carol.id])
        messages = await service.list_messages(db_session, conversation, limit=50, before=None)
        assert messages[-1].message_type == MESSAGE_SYSTEM
        assert "Carol" in messages[-1].body


class TestMessages:
    async def test_empty_message_without_files_is_rejected(self, db_session, team) -> None:
        agency, alice, bob, _carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])
        with pytest.raises(HTTPException) as exc:
            await service.post_message(db_session, conversation, sender=alice, body="   ", uploads=[])
        assert exc.value.status_code == 400

    async def test_attachment_over_the_cap_is_rejected(self, db_session, team, monkeypatch) -> None:
        agency, alice, bob, _carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])
        monkeypatch.setattr(service.settings, "message_upload_max_bytes", 4)
        with pytest.raises(HTTPException) as exc:
            await service.post_message(
                db_session,
                conversation,
                sender=alice,
                body="",
                uploads=[("big.bin", b"12345", "application/octet-stream")],
            )
        assert exc.value.status_code == 413

    async def test_author_can_delete_own_but_not_others(self, db_session, team) -> None:
        agency, alice, bob, _carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])
        posted = await service.post_message(db_session, conversation, sender=bob, body="secret", uploads=[])

        message = await service.get_message_or_404(db_session, conversation.id, posted.id)
        with pytest.raises(HTTPException) as exc:
            await service.delete_message(
                db_session, conversation, message, requested_by=alice, requester_role=ROLE_MEMBER
            )
        assert exc.value.status_code == 403

        # ...but an owner/admin can (moderation).
        await service.delete_message(db_session, conversation, message, requested_by=alice, requester_role=ROLE_OWNER)
        messages = await service.list_messages(db_session, conversation, limit=50, before=None)
        assert messages[0].deleted_at is not None
        assert messages[0].body == ""

    async def test_edit_sets_edited_at(self, db_session, team) -> None:
        agency, alice, bob, _carol = team
        conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])
        posted = await service.post_message(db_session, conversation, sender=alice, body="draft", uploads=[])
        message = await service.get_message_or_404(db_session, conversation.id, posted.id)
        updated = await service.edit_message(db_session, conversation, message, alice, body="final")
        assert updated.body == "final"
        assert updated.edited_at is not None


class TestContextFilters:
    async def test_filter_by_project(self, db_session, team) -> None:
        from tests.factories import make_client, make_project

        agency, alice, bob, _carol = team
        client = await make_client(db_session, agency=agency)
        project = await make_project(db_session, agency=agency, created_by=alice, client=client)

        scoped = await service.create_conversation(
            db_session,
            agency,
            creator=alice,
            kind=KIND_GROUP,
            title="Project chat",
            participant_user_ids=[bob.id],
            client_id=None,
            project_id=project.id,
            initial_message=None,
        )
        await make_conversation(db_session, agency=agency, creator=alice, others=[bob], title="Unrelated")

        rows = await service.list_conversations(db_session, agency, alice, project_id=project.id)
        assert [r["id"] for r in rows] == [scoped.id]
        assert rows[0]["project_name"] == project.name
