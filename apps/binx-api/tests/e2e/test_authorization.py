"""
End-to-end authorization boundary tests.

These pin down the two-layer model:

* ``core.dependencies`` — you must present a valid access token for a real,
  active user.
* ``agencies.dependencies.require_agency_role`` — and you must have the right
  role *within the agency named in the URL*. A non-member gets 404 (an
  agency's existence isn't leaked), an under-privileged member gets 403.
"""

from __future__ import annotations

import uuid

import pytest

from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, AgencyMember
from tests.conftest import auth_headers
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def agency_with_roles(db_session):
    """An agency plus one user of each agency role, each with ready-made headers."""
    owner = await make_user(db_session)
    admin = await make_user(db_session)
    member = await make_user(db_session)
    agency = await make_agency(db_session, owner=owner)
    db_session.add(AgencyMember(agency_id=agency.id, user_id=admin.id, role=ROLE_ADMIN))
    db_session.add(AgencyMember(agency_id=agency.id, user_id=member.id, role=ROLE_MEMBER))
    await db_session.commit()
    return agency, {
        "owner": auth_headers(owner),
        "admin": auth_headers(admin),
        "member": auth_headers(member),
    }


class TestSessionLayer:
    async def test_inactive_user_is_rejected_even_with_a_valid_token(self, client, db_session) -> None:
        account = await make_user(db_session, is_active=False)
        response = await client.get("/users/me", headers=auth_headers(account))
        assert response.status_code == 401

    async def test_token_for_a_deleted_user_is_rejected(self, client, db_session) -> None:
        account = await make_user(db_session)
        headers = auth_headers(account)
        await db_session.delete(account)
        await db_session.commit()
        assert (await client.get("/users/me", headers=headers)).status_code == 401


class TestAgencyRoleLayer:
    async def test_non_member_gets_404_not_403(self, client, agency_with_roles, db_session) -> None:
        agency, _headers = agency_with_roles
        outsider = await make_user(db_session)
        response = await client.get(f"/agencies/{agency.id}/members", headers=auth_headers(outsider))
        assert response.status_code == 404

    async def test_unknown_agency_id_is_404(self, client, auth_client) -> None:
        response = await auth_client.get(f"/agencies/{uuid.uuid4()}/members")
        assert response.status_code == 404

    async def test_member_can_do_day_to_day_work(self, client, agency_with_roles) -> None:
        agency, headers = agency_with_roles
        # Listing clients is open to any member.
        assert (await client.get(f"/agencies/{agency.id}/clients", headers=headers["member"])).status_code == 200

    async def test_member_cannot_touch_agency_settings(self, client, agency_with_roles) -> None:
        agency, headers = agency_with_roles
        response = await client.patch(f"/agencies/{agency.id}", json={"name": "Hijacked"}, headers=headers["member"])
        assert response.status_code == 403

    async def test_admin_can_manage_invitations_but_not_delete_the_agency(self, client, agency_with_roles) -> None:
        agency, headers = agency_with_roles
        assert (await client.get(f"/agencies/{agency.id}/invitations", headers=headers["admin"])).status_code == 200
        assert (await client.delete(f"/agencies/{agency.id}", headers=headers["admin"])).status_code == 403

    async def test_only_the_owner_can_delete_the_agency(self, client, agency_with_roles) -> None:
        agency, headers = agency_with_roles
        assert (await client.delete(f"/agencies/{agency.id}", headers=headers["owner"])).status_code == 204

    async def test_project_endpoints_are_hidden_from_non_members(self, client, agency_with_roles, db_session) -> None:
        agency, _headers = agency_with_roles
        outsider = await make_user(db_session)
        response = await client.get(f"/agencies/{agency.id}/projects", headers=auth_headers(outsider))
        assert response.status_code == 404
