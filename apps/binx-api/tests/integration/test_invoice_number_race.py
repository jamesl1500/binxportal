"""Two invoices created at once in one agency must get different numbers.

Uses real, separate connections that commit (like two concurrent requests),
so it can't share the usual rolled-back ``db_session``; it cleans up after
itself instead. Regression: the number counter was read from the session's
cached settings row before the row lock was taken, so a request that waited
on the lock still used the stale counter and hit the unique constraint.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import Agency
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import Invoice
from binx_api.modules.invoicing.schemas import LineItemInput
from binx_api.modules.users.models import User
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.integration


async def test_concurrent_invoices_get_distinct_numbers(engine) -> None:
    async with AsyncSession(engine, expire_on_commit=False) as setup:
        owner = await make_user(setup, full_name="Race Owner")
        agency = await make_agency(setup, owner=owner, name="Race Agency")
        client = await make_client(setup, agency=agency)
        ids = (owner.id, agency.id, client.id)

    async def create_one() -> str:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            agency_row = await db.get(Agency, ids[1])
            owner_row = await db.get(User, ids[0])
            # Load the settings row unlocked first, the way create_invoice's
            # callers already have it in the session.
            await invoicing_service.get_or_create_billing_settings(db, agency_row)
            invoice = await invoicing_service.create_invoice(
                db,
                agency_row,
                created_by=owner_row,
                client_id=ids[2],
                project_id=None,
                issue_date=None,
                due_date=None,
                discount_amount_cents=None,
                discount_percent=None,
                tax_rate_percent=Decimal("0"),
                notes=None,
                payment_instructions=None,
                line_items=[LineItemInput(description="Work", quantity=Decimal("1"), unit_price_cents=100)],
            )
            return invoice.number

    try:
        numbers = await asyncio.gather(*(create_one() for _ in range(4)))
        assert len(set(numbers)) == 4, numbers
    finally:
        async with AsyncSession(engine) as cleanup:
            await cleanup.execute(delete(Invoice).where(Invoice.agency_id == ids[1]))
            agency_row = await cleanup.scalar(select(Agency).where(Agency.id == ids[1]))
            if agency_row is not None:
                await cleanup.delete(agency_row)
            owner_row = await cleanup.get(User, ids[0])
            if owner_row is not None:
                await cleanup.delete(owner_row)
            await cleanup.commit()
