"""
Integration tests for the agency subdomain feature (agencies/service.py) —
plan gating, format/reserved-word validation, uniqueness, and the
downgrade-keeps-the-reservation-but-stops-serving-it behavior.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from binx_api.modules.agencies import service
from binx_api.modules.billing import service as billing_service
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration


class TestUpdateAgencySubdomain:
    async def test_free_plan_is_rejected(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        with pytest.raises(HTTPException) as exc_info:
            await service.update_agency_subdomain(db_session, agency, subdomain="foundryframe", actor=owner)
        assert exc_info.value.status_code == 402

    async def test_starter_plan_can_set_and_clear(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)

        updated = await service.update_agency_subdomain(db_session, agency, subdomain="FoundryFrame", actor=owner)
        assert updated.subdomain == "foundryframe"

        cleared = await service.update_agency_subdomain(db_session, agency, subdomain=None, actor=owner)
        assert cleared.subdomain is None

    async def test_rejects_reserved_words(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)

        with pytest.raises(HTTPException) as exc_info:
            await service.update_agency_subdomain(db_session, agency, subdomain="www", actor=owner)
        assert exc_info.value.status_code == 400

    async def test_rejects_bad_format(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)

        for bad in ("ab", "-leads", "leads-", "Has Spaces", "a" * 64):
            with pytest.raises(HTTPException) as exc_info:
                await service.update_agency_subdomain(db_session, agency, subdomain=bad, actor=owner)
            assert exc_info.value.status_code == 400

    async def test_rejects_a_subdomain_already_taken(self, db_session) -> None:
        owner = await make_user(db_session)
        first = await make_agency(db_session, owner=owner, name="First")
        second = await make_agency(db_session, owner=owner, name="Second")
        await billing_service.change_plan(db_session, first, new_plan="starter", actor=owner)
        await billing_service.change_plan(db_session, second, new_plan="starter", actor=owner)

        await service.update_agency_subdomain(db_session, first, subdomain="foundryframe", actor=owner)
        with pytest.raises(HTTPException) as exc_info:
            await service.update_agency_subdomain(db_session, second, subdomain="foundryframe", actor=owner)
        assert exc_info.value.status_code == 409


class TestGetAgencyBySubdomain:
    async def test_resolves_a_claimed_subdomain(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)
        await service.update_agency_subdomain(db_session, agency, subdomain="foundryframe", actor=owner)

        found = await service.get_agency_by_subdomain(db_session, "FoundryFrame")
        assert found is not None
        assert found.id == agency.id

    async def test_unclaimed_subdomain_returns_none(self, db_session) -> None:
        assert await service.get_agency_by_subdomain(db_session, "nope") is None

    async def test_downgrade_keeps_the_reservation_but_stops_serving_it(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)
        await service.update_agency_subdomain(db_session, agency, subdomain="foundryframe", actor=owner)

        await billing_service.change_plan(db_session, agency, new_plan="free", actor=owner)

        # Still reserved — a different agency can't claim it...
        other = await make_agency(db_session, owner=owner, name="Other")
        await billing_service.change_plan(db_session, other, new_plan="starter", actor=owner)
        with pytest.raises(HTTPException) as exc_info:
            await service.update_agency_subdomain(db_session, other, subdomain="foundryframe", actor=owner)
        assert exc_info.value.status_code == 409

        # ...but it no longer resolves publicly while the agency is below plan.
        assert await service.get_agency_by_subdomain(db_session, "foundryframe") is None
