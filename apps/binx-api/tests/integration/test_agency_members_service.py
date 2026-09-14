"""
Integration tests for the membership half of
``binx_api.modules.agencies.service`` — the roster query (with its privacy +
profile joins), the owner/admin edit of a membership's agency-scoped fields,
and the invitation history / resend helpers that back the team page.
"""

from __future__ import annotations

import pytest

from binx_api.modules.agencies import service
from binx_api.modules.agencies.models import ROLE_MEMBER
from binx_api.modules.users.models import UserPrivacySettings
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.integration


class TestListAgencyMembers:
    async def test_returns_a_quadruple_per_member_with_privacy_when_present(self, db_session) -> None:
        owner = await make_user(db_session, full_name="Olivia Owner")
        teammate = await make_user(db_session, full_name="Tim Teammate")
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=teammate)
        db_session.add(UserPrivacySettings(user_id=teammate.id, profile_visibility="private"))
        await db_session.commit()

        rows = await service.list_agency_members(db_session, agency.id)

        by_user = {user.id: (member, user, privacy, profile) for member, user, privacy, profile in rows}
        assert set(by_user) == {owner.id, teammate.id}
        assert by_user[owner.id][2] is None
        assert by_user[teammate.id][2].profile_visibility == "private"
        # Neither has visited their own /profile pages yet — no row created.
        assert by_user[owner.id][3] is None
        assert by_user[teammate.id][3] is None


class TestUpdateMemberDetails:
    async def test_sets_title_and_admin_notes(self, db_session) -> None:
        owner = await make_user(db_session)
        teammate = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await add_agency_member(db_session, agency=agency, user=teammate)

        updated = await service.update_member_details(
            db_session, member, title="Lead Designer", admin_notes="great with clients"
        )

        assert updated.title == "Lead Designer"
        assert updated.admin_notes == "great with clients"

    async def test_clears_fields_when_given_none(self, db_session) -> None:
        owner = await make_user(db_session)
        teammate = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await add_agency_member(db_session, agency=agency, user=teammate)
        await service.update_member_details(db_session, member, title="Designer", admin_notes="notes")

        updated = await service.update_member_details(db_session, member, title=None, admin_notes=None)

        assert updated.title is None
        assert updated.admin_notes is None


class TestListInvitations:
    async def test_include_all_returns_revoked_invitations_too(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        pending, _ = await service.create_invitation(
            db_session, agency, email="pending@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        revoked, _ = await service.create_invitation(
            db_session, agency, email="revoked@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        await service.revoke_invitation(db_session, revoked)

        pending_only = await service.list_invitations(db_session, agency.id)
        everything = await service.list_invitations(db_session, agency.id, include_all=True)

        assert [inv.id for inv, _ in pending_only] == [pending.id]
        assert {inv.id for inv, _ in everything} == {pending.id, revoked.id}


class TestResendInvitation:
    async def test_rotates_the_token_and_keeps_the_row(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitation, first_token = await service.create_invitation(
            db_session, agency, email="invitee@example.com", role=ROLE_MEMBER, invited_by=owner
        )

        resent, second_token = await service.resend_invitation(db_session, agency, invitation, invited_by=owner)

        assert resent.id == invitation.id
        assert second_token != first_token

    async def test_rejects_a_non_pending_invitation(self, db_session) -> None:
        from fastapi import HTTPException

        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invitation, _ = await service.create_invitation(
            db_session, agency, email="invitee@example.com", role=ROLE_MEMBER, invited_by=owner
        )
        await service.revoke_invitation(db_session, invitation)

        with pytest.raises(HTTPException) as exc:
            await service.resend_invitation(db_session, agency, invitation, invited_by=owner)
        assert exc.value.status_code == 409
