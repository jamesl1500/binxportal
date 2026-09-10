"""
Integration tests for the invitation half of ``binx_api.modules.agencies.service``
— sending (and re-sending) an invite, previewing it, accepting it (with the
email-match guard), revoking it, and expiry.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.agencies import service
from binx_api.modules.agencies.models import (
    INVITATION_ACCEPTED,
    INVITATION_REVOKED,
    ROLE_ADMIN,
    ROLE_MEMBER,
    AgencyInvitation,
    AgencyMember,
)
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration


class TestCreateInvitation:
    async def test_creates_a_pending_invitation_and_returns_the_raw_token(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        invitation, raw_token = await service.create_invitation(
            db_session, agency, email="invitee@example.com", role=ROLE_MEMBER, invited_by=owner
        )

        assert raw_token  # only returned here, never persisted in the clear
        assert invitation.email == "invitee@example.com"
        assert invitation.status == "pending"

    async def test_resending_reuses_the_row_and_rotates_the_token(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        first, first_token = await service.create_invitation(
            db_session, agency, email="invitee@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        second, second_token = await service.create_invitation(
            db_session, agency, email="invitee@example.com", role=ROLE_ADMIN, invited_by=owner
        )

        assert second.id == first.id  # same row, not a duplicate
        assert second.role == ROLE_ADMIN  # role was updated
        assert first_token != second_token
        rows = (
            (await db_session.execute(select(AgencyInvitation).where(AgencyInvitation.agency_id == agency.id)))
            .scalars()
            .all()
        )
        assert len(rows) == 1

    async def test_rejects_inviting_an_existing_member(self, db_session) -> None:
        owner = await make_user(db_session, email="owner@example.com")
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.create_invitation(
                db_session, agency, email="owner@example.com", role=ROLE_MEMBER, invited_by=owner
            )
        assert exc.value.status_code == 409

    async def test_lists_only_pending_invitations(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        pending, _ = await service.create_invitation(
            db_session, agency, email="pending@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        revoked, _ = await service.create_invitation(
            db_session, agency, email="revoked@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        await service.revoke_invitation(db_session, revoked)

        rows = await service.list_invitations(db_session, agency.id)
        assert [inv.id for inv, _inviter in rows] == [pending.id]


class TestPreviewAndAccept:
    async def test_preview_returns_agency_and_inviter_without_consuming(self, db_session) -> None:
        owner = await make_user(db_session, full_name="Olivia Owner")
        agency = await make_agency(db_session, owner=owner, name="Preview Co")
        _, raw_token = await service.create_invitation(
            db_session, agency, email="see@example.com", role=ROLE_MEMBER, invited_by=owner
        )

        invitation, resolved_agency, inviter = await service.preview_invitation(db_session, raw_token)
        assert resolved_agency.name == "Preview Co"
        assert inviter.full_name == "Olivia Owner"
        assert invitation.status == "pending"  # untouched

    async def test_accept_creates_the_membership_with_the_invited_role(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitee = await make_user(db_session, email="joiner@example.com")
        _, raw_token = await service.create_invitation(
            db_session, agency, email="joiner@example.com", role=ROLE_ADMIN, invited_by=owner
        )

        resolved_agency, role = await service.accept_invitation(db_session, raw_token, accepting_user=invitee)

        assert resolved_agency.id == agency.id
        assert role == ROLE_ADMIN
        membership = (
            await db_session.execute(
                select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.user_id == invitee.id)
            )
        ).scalar_one()
        assert membership.role == ROLE_ADMIN

    async def test_accept_marks_the_invitation_accepted(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitee = await make_user(db_session, email="joiner2@example.com")
        invitation, raw_token = await service.create_invitation(
            db_session, agency, email="joiner2@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        await service.accept_invitation(db_session, raw_token, accepting_user=invitee)
        await db_session.refresh(invitation)
        assert invitation.status == INVITATION_ACCEPTED
        assert invitation.accepted_at is not None

    async def test_accept_rejects_a_mismatched_email(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        wrong_person = await make_user(db_session, email="not-the-invitee@example.com")
        _, raw_token = await service.create_invitation(
            db_session, agency, email="intended@example.com", role=ROLE_MEMBER, invited_by=owner
        )

        with pytest.raises(HTTPException) as exc:
            await service.accept_invitation(db_session, raw_token, accepting_user=wrong_person)
        assert exc.value.status_code == 403

    async def test_accept_is_case_insensitive_on_email(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitee = await make_user(db_session, email="mixedcase@example.com")
        _, raw_token = await service.create_invitation(
            db_session, agency, email="MixedCase@Example.com", role=ROLE_MEMBER, invited_by=owner
        )
        _agency, role = await service.accept_invitation(db_session, raw_token, accepting_user=invitee)
        assert role == ROLE_MEMBER

    async def test_accept_rejects_a_revoked_invitation(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitee = await make_user(db_session, email="revoked-join@example.com")
        invitation, raw_token = await service.create_invitation(
            db_session, agency, email="revoked-join@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        await service.revoke_invitation(db_session, invitation)
        assert invitation.status == INVITATION_REVOKED

        with pytest.raises(HTTPException) as exc:
            await service.accept_invitation(db_session, raw_token, accepting_user=invitee)
        assert exc.value.status_code == 400

    async def test_accept_rejects_an_expired_invitation(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitee = await make_user(db_session, email="late@example.com")
        invitation, raw_token = await service.create_invitation(
            db_session, agency, email="late@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        invitation.expires_at = datetime.now(UTC) - timedelta(days=1)
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await service.accept_invitation(db_session, raw_token, accepting_user=invitee)
        assert exc.value.status_code == 400
