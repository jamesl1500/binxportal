"""Integration tests for binx_api.modules.services.service — the catalog's
name rules, archiving, and the cross-agency guard every line-item writer
relies on."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.proposals import service as proposals_service
from binx_api.modules.proposals.models import ProposalLineItem
from binx_api.modules.proposals.schemas import ProposalLineItemInput
from binx_api.modules.services import service
from binx_api.modules.services.schemas import ServiceCreate, ServiceUpdate
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Owner")
    agency = await make_agency(db_session, owner=owner)
    return owner, agency


def _create(name: str = "Brand strategy", **overrides) -> ServiceCreate:
    return ServiceCreate(name=name, unit_price_cents=500_000, **overrides)


class TestCatalog:
    async def test_create_and_list(self, db_session, ctx) -> None:
        owner, agency = ctx
        created = await service.create_service(
            db_session, agency.id, _create(description="  Workshops + positioning  ", pricing_type="fixed"), actor=owner
        )
        assert created.description == "Workshops + positioning"
        assert created.default_quantity == Decimal("1")
        assert [s.id for s in await service.list_services(db_session, agency.id)] == [created.id]

    async def test_duplicate_active_name_is_409_case_insensitive(self, db_session, ctx) -> None:
        owner, agency = ctx
        await service.create_service(db_session, agency.id, _create("Retainer"), actor=owner)
        with pytest.raises(HTTPException) as exc:
            await service.create_service(db_session, agency.id, _create("  retainer "), actor=owner)
        assert exc.value.status_code == 409

    async def test_archiving_frees_the_name_and_hides_it(self, db_session, ctx) -> None:
        owner, agency = ctx
        old = await service.create_service(db_session, agency.id, _create("Retainer"), actor=owner)
        await service.update_service(db_session, old, ServiceUpdate(is_archived=True), actor=owner)

        new = await service.create_service(db_session, agency.id, _create("Retainer"), actor=owner)
        assert [s.id for s in await service.list_services(db_session, agency.id)] == [new.id]
        everything = await service.list_services(db_session, agency.id, include_archived=True)
        assert {s.id for s in everything} == {old.id, new.id}

        # Restoring the old one would now collide with the new one.
        with pytest.raises(HTTPException) as exc:
            await service.update_service(db_session, old, ServiceUpdate(is_archived=False), actor=owner)
        assert exc.value.status_code == 409

    async def test_rename_into_existing_name_is_409(self, db_session, ctx) -> None:
        owner, agency = ctx
        await service.create_service(db_session, agency.id, _create("Design"), actor=owner)
        other = await service.create_service(db_session, agency.id, _create("Development"), actor=owner)
        with pytest.raises(HTTPException) as exc:
            await service.update_service(db_session, other, ServiceUpdate(name="design"), actor=owner)
        assert exc.value.status_code == 409

    async def test_partial_update_and_clearing_description(self, db_session, ctx) -> None:
        owner, agency = ctx
        item = await service.create_service(db_session, agency.id, _create(description="Old copy"), actor=owner)
        updated = await service.update_service(
            db_session, item, ServiceUpdate(unit_price_cents=650_000, description=""), actor=owner
        )
        assert updated.unit_price_cents == 650_000
        assert updated.description is None
        assert updated.name == "Brand strategy"


class TestValidateServiceIds:
    async def test_other_agencys_service_is_rejected(self, db_session, ctx) -> None:
        owner, agency = ctx
        other_owner = await make_user(db_session, full_name="Other")
        other_agency = await make_agency(db_session, owner=other_owner, name="Other Agency")
        foreign = await service.create_service(db_session, other_agency.id, _create(), actor=other_owner)

        with pytest.raises(HTTPException) as exc:
            await service.validate_service_ids(db_session, agency.id, [foreign.id])
        assert exc.value.status_code == 422

    async def test_none_and_own_ids_pass(self, db_session, ctx) -> None:
        owner, agency = ctx
        own = await service.create_service(db_session, agency.id, _create(), actor=owner)
        await service.validate_service_ids(db_session, agency.id, [None, own.id, own.id])

    async def test_deleting_a_service_keeps_the_copied_line(self, db_session, ctx) -> None:
        owner, agency = ctx
        item = await service.create_service(db_session, agency.id, _create(), actor=owner)
        proposal = await proposals_service.create_proposal(
            db_session,
            agency,
            created_by=owner,
            lead_id=None,
            client_id=None,
            title="Brand refresh",
            recipient_name=None,
            recipient_email="jane@example.com",
            content=None,
            currency="USD",
            tax_rate_percent=Decimal("0"),
            valid_until=None,
            line_items=[
                ProposalLineItemInput(
                    description=item.name,
                    details="Workshops",
                    quantity=Decimal("1"),
                    unit_price_cents=item.unit_price_cents,
                    service_id=item.id,
                )
            ],
        )
        proposal_id = proposal.id
        await service.delete_service(db_session, item, actor=owner)

        db_session.expire_all()
        line = (
            await db_session.execute(select(ProposalLineItem).where(ProposalLineItem.proposal_id == proposal_id))
        ).scalar_one()
        assert line.service_id is None
        assert line.description == "Brand strategy"
        assert line.details == "Workshops"
        assert line.unit_price_cents == 500_000
