"""
Integration tests for ``binx_api.modules.client_portal.service`` — the
client-contact invitation flow (mirrors the agency invitation tests), the
"join existing client conversations on accept" behaviour, and the portal
project-progress rollup.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.client_portal import service
from binx_api.modules.client_portal.models import CONTACT_INVITATION_ACCEPTED, ClientContact
from binx_api.modules.messaging.models import ConversationParticipant
from binx_api.modules.messaging.service import create_conversation
from binx_api.modules.projects.models import ProjectTask
from binx_api.modules.projects.service import get_project_board
from tests.factories import add_agency_member, make_agency, make_client, make_project, make_task, make_user

pytestmark = pytest.mark.integration


class TestClientInvitationFlow:
    async def test_invite_then_accept_creates_a_contact(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency)
        invitee = await make_user(db_session, email="contact@acme-client.example")

        invitation, raw_token = await service.create_client_invitation(
            db_session, agency, client, email=invitee.email, invited_by=owner
        )
        assert raw_token
        assert invitation.status == "pending"

        agency_out, client_out, contact = await service.accept_client_invitation(
            db_session, raw_token, accepting_user=invitee
        )
        assert agency_out.id == agency.id
        assert client_out.id == client.id
        assert contact.user_id == invitee.id
        assert contact.is_primary is True  # first contact for the client

        await db_session.refresh(invitation)
        assert invitation.status == CONTACT_INVITATION_ACCEPTED

    async def test_accepting_with_the_wrong_account_is_forbidden(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency)
        _invitation, raw_token = await service.create_client_invitation(
            db_session, agency, client, email="intended@acme-client.example", invited_by=owner
        )
        someone_else = await make_user(db_session, email="other@acme-client.example")

        with pytest.raises(HTTPException) as exc:
            await service.accept_client_invitation(db_session, raw_token, accepting_user=someone_else)
        assert exc.value.status_code == 403

    async def test_inviting_an_existing_contact_conflicts(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency)
        invitee = await make_user(db_session, email="dup@acme-client.example")
        _i, token = await service.create_client_invitation(
            db_session, agency, client, email=invitee.email, invited_by=owner
        )
        await service.accept_client_invitation(db_session, token, accepting_user=invitee)

        with pytest.raises(HTTPException) as exc:
            await service.create_client_invitation(db_session, agency, client, email=invitee.email, invited_by=owner)
        assert exc.value.status_code == 409


class TestConversationMembership:
    async def test_accepting_joins_existing_client_conversations(self, db_session) -> None:
        owner = await make_user(db_session)
        teammate = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=teammate)
        client = await make_client(db_session, agency=agency)

        convo = await create_conversation(
            db_session,
            agency,
            creator=owner,
            kind="group",
            title="Kickoff",
            participant_user_ids=[teammate.id],
            client_id=client.id,
            project_id=None,
            initial_message=None,
        )

        invitee = await make_user(db_session, email="joiner@acme-client.example")
        _i, token = await service.create_client_invitation(
            db_session, agency, client, email=invitee.email, invited_by=owner
        )
        await service.accept_client_invitation(db_session, token, accepting_user=invitee)

        rows = (
            (
                await db_session.execute(
                    select(ConversationParticipant.user_id).where(ConversationParticipant.conversation_id == convo.id)
                )
            )
            .scalars()
            .all()
        )
        assert invitee.id in rows

    async def test_new_client_conversation_includes_existing_contacts(self, db_session) -> None:
        owner = await make_user(db_session)
        teammate = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=teammate)
        client = await make_client(db_session, agency=agency)

        contact_user = await make_user(db_session, email="early@acme-client.example")
        _i, token = await service.create_client_invitation(
            db_session, agency, client, email=contact_user.email, invited_by=owner
        )
        await service.accept_client_invitation(db_session, token, accepting_user=contact_user)

        convo = await create_conversation(
            db_session,
            agency,
            creator=owner,
            kind="group",
            title="Later thread",
            participant_user_ids=[teammate.id],
            client_id=client.id,
            project_id=None,
            initial_message=None,
        )

        rows = (
            (
                await db_session.execute(
                    select(ConversationParticipant.user_id).where(ConversationParticipant.conversation_id == convo.id)
                )
            )
            .scalars()
            .all()
        )
        assert contact_user.id in rows


class TestPortalProjects:
    async def test_progress_counts_the_final_column_as_done(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency)
        project = await make_project(db_session, agency=agency, created_by=owner, client=client)

        board = await get_project_board(db_session, project.id)
        todo_list = board[0][0]
        done_list = board[-1][0]

        await make_task(db_session, project=project, task_list=todo_list, title="A")
        await make_task(db_session, project=project, task_list=todo_list, title="B")
        t = await make_task(db_session, project=project, task_list=todo_list, title="C")
        t.list_id = done_list.id
        await db_session.commit()

        rows = await service.list_portal_projects(db_session, client.id)
        assert len(rows) == 1
        _project, progress = rows[0]
        assert progress.total_tasks == 3
        assert progress.done_tasks == 1
        assert progress.percent == 33

    async def test_portal_project_lookup_is_scoped_to_the_client(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client_a = await make_client(db_session, agency=agency, name="A")
        client_b = await make_client(db_session, agency=agency, name="B")
        project_b = await make_project(db_session, agency=agency, created_by=owner, client=client_b)

        with pytest.raises(HTTPException) as exc:
            await service.get_portal_project_or_404(db_session, client_a.id, project_b.id)
        assert exc.value.status_code == 404


class TestPortalMemberships:
    async def test_lists_every_agency_client_the_user_is_a_contact_for(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency)
        user = await make_user(db_session, email="multi@acme-client.example")
        _i, token = await service.create_client_invitation(
            db_session, agency, client, email=user.email, invited_by=owner
        )
        await service.accept_client_invitation(db_session, token, accepting_user=user)

        memberships = await service.get_portal_memberships(db_session, user)
        assert [(a.id, c.id) for a, c, _ in memberships] == [(agency.id, client.id)]

        # sanity: no stray tasks left dangling
        assert (await db_session.execute(select(ProjectTask))).first() is None
        assert (await db_session.execute(select(ClientContact))).first() is not None
