"""
Integration tests for ``binx_api.modules.agencies.service`` — agency creation
+ ownership, the member roster, and the role/removal guards that keep an
agency from ever losing its last owner.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.agencies import service
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, AgencyMember
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration


class TestCreateAgency:
    async def test_creates_the_agency_and_an_owner_membership(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await service.create_agency_with_owner(db_session, owner=owner, name="Bright Studio")

        assert agency.slug == "bright-studio"
        members = (
            (await db_session.execute(select(AgencyMember).where(AgencyMember.agency_id == agency.id))).scalars().all()
        )
        assert len(members) == 1
        assert members[0].user_id == owner.id
        assert members[0].role == ROLE_OWNER

    async def test_slug_is_disambiguated_on_collision(self, db_session) -> None:
        owner = await make_user(db_session)
        a = await service.create_agency_with_owner(db_session, owner=owner, name="Same Name")
        b = await service.create_agency_with_owner(db_session, owner=owner, name="Same Name")
        assert a.slug == "same-name"
        assert b.slug == "same-name-2"

    async def test_lists_agencies_for_a_user_oldest_first(self, db_session) -> None:
        owner = await make_user(db_session)
        first = await make_agency(db_session, owner=owner, name="First")
        second = await make_agency(db_session, owner=owner, name="Second")

        rows = await service.get_agencies_for_user(db_session, owner)
        assert [agency.id for agency, _role, _logo in rows] == [first.id, second.id]
        assert all(role == ROLE_OWNER for _agency, role, _logo in rows)


class TestUpdateAndDelete:
    async def test_rename_leaves_the_slug_untouched(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner, name="Old Name")
        await service.update_agency(db_session, agency, name="Totally New Name")
        assert agency.name == "Totally New Name"
        assert agency.slug == "old-name"

    async def test_delete_cascades_to_memberships(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        agency_id = agency.id
        await service.delete_agency(db_session, agency)
        remaining = (
            (await db_session.execute(select(AgencyMember).where(AgencyMember.agency_id == agency_id))).scalars().all()
        )
        assert remaining == []


class TestMemberRoleGuards:
    async def _add_member(self, db_session, agency, *, role=ROLE_MEMBER) -> AgencyMember:
        user = await make_user(db_session)
        member = AgencyMember(agency_id=agency.id, user_id=user.id, role=role)
        db_session.add(member)
        await db_session.commit()
        await db_session.refresh(member)
        return member

    async def test_promotes_and_demotes_a_regular_member(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await self._add_member(db_session, agency)

        await service.update_member_role(db_session, member, role=ROLE_ADMIN)
        assert member.role == ROLE_ADMIN

    async def test_cannot_demote_the_only_owner(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        owner_member = (
            await db_session.execute(
                select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.user_id == owner.id)
            )
        ).scalar_one()

        with pytest.raises(HTTPException) as exc:
            await service.update_member_role(db_session, owner_member, role=ROLE_ADMIN)
        assert exc.value.status_code == 409

    async def test_can_demote_an_owner_when_another_owner_remains(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        second_owner = await self._add_member(db_session, agency, role=ROLE_OWNER)

        await service.update_member_role(db_session, second_owner, role=ROLE_MEMBER)
        assert second_owner.role == ROLE_MEMBER

    async def test_cannot_remove_yourself(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        owner_member = (
            await db_session.execute(
                select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.user_id == owner.id)
            )
        ).scalar_one()

        with pytest.raises(HTTPException) as exc:
            await service.remove_agency_member(db_session, owner_member, requested_by=owner)
        assert exc.value.status_code == 400

    async def test_cannot_remove_the_last_owner(self, db_session) -> None:
        owner = await make_user(db_session)
        remover = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        owner_member = (
            await db_session.execute(
                select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.user_id == owner.id)
            )
        ).scalar_one()

        with pytest.raises(HTTPException) as exc:
            await service.remove_agency_member(db_session, owner_member, requested_by=remover)
        assert exc.value.status_code == 409

    async def test_removes_a_regular_member(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await self._add_member(db_session, agency)
        member_id = member.id

        await service.remove_agency_member(db_session, member, requested_by=owner)
        assert (await db_session.get(AgencyMember, member_id)) is None
