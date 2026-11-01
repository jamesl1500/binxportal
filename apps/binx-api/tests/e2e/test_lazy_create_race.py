"""
Concurrency tests for the lazily-created one-row-per-parent tables (an
agency's billing settings, a user's profile, ...) — every ``get_or_create_*``
service helper that goes through ``core/database.py::get_or_create``.

A settings page fires several requests at once on a first visit, each lazily
creating the same row; the losers used to 500 on the unique parent-id index.
``db_session`` can't reproduce that (it's one connection, one transaction), so
these use two real sessions on their own connections and a barrier that lines
both up right after their initial SELECT — guaranteeing both see "no row yet"
before either inserts. Data is really committed, so it's cleaned up after.
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyProfile, ClientPortalBranding
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import AgencyBillingSettings
from binx_api.modules.meetings import service as meetings_service
from binx_api.modules.meetings.models import AgencyMeetingSettings
from binx_api.modules.users import service as users_service
from binx_api.modules.users.models import User, UserAppearanceSettings, UserDashboardLayout, UserProfile
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.e2e

# (helper, which parent it takes, the model it creates, that model's parent-id column)
CASES = [
    (invoicing_service.get_or_create_billing_settings, "agency", AgencyBillingSettings, "agency_id"),
    (agencies_service.get_or_create_agency_profile, "agency", AgencyProfile, "agency_id"),
    (agencies_service.get_or_create_client_branding, "client", ClientPortalBranding, "client_id"),
    (meetings_service.get_or_create_meeting_settings, "agency", AgencyMeetingSettings, "agency_id"),
    (users_service.get_or_create_profile, "user", UserProfile, "user_id"),
    (users_service.get_or_create_appearance_settings, "user", UserAppearanceSettings, "user_id"),
    (users_service.get_or_create_dashboard_layout, "user", UserDashboardLayout, "user_id"),
]


@pytest.mark.parametrize(("helper", "parent_kind", "model", "key"), CASES, ids=[c[0].__name__ for c in CASES])
async def test_concurrent_first_access_creates_exactly_one_row(engine, helper, parent_kind, model, key) -> None:
    barrier = asyncio.Barrier(2)

    class _PauseAfterFirstQuery(AsyncSession):
        _paused = False

        async def execute(self, *args, **kwargs):
            result = await super().execute(*args, **kwargs)
            if not self._paused:
                self._paused = True
                await barrier.wait()
            return result

    async with AsyncSession(engine, expire_on_commit=False) as setup:
        owner = await make_user(setup, full_name="Race Owner")
        agency = await make_agency(setup, owner=owner)
        client = await make_client(setup, agency=agency, name="Race Client")
    parent = {"agency": agency, "client": client, "user": owner}[parent_kind]

    async def first_access():
        async with _PauseAfterFirstQuery(engine, expire_on_commit=False) as db:
            return await helper(db, parent)

    try:
        first, second = await asyncio.gather(first_access(), first_access())
        assert first.id == second.id
        async with AsyncSession(engine) as check:
            count = await check.scalar(select(func.count()).select_from(model).where(getattr(model, key) == parent.id))
        assert count == 1
    finally:
        async with AsyncSession(engine) as cleanup:
            # Cascades to the client and every agency-/user-scoped row created above.
            await cleanup.execute(delete(Agency).where(Agency.id == agency.id))
            await cleanup.execute(delete(User).where(User.id == owner.id))
            await cleanup.commit()


async def test_created_row_gets_the_model_column_defaults(db_session) -> None:
    # The Core INSERT behind get_or_create still applies Python-side column
    # defaults — the same values the old ORM add() produced.
    owner = await make_user(db_session)
    agency = await make_agency(db_session, owner=owner)

    billing = await invoicing_service.get_or_create_billing_settings(db_session, agency)
    meetings = await meetings_service.get_or_create_meeting_settings(db_session, agency)
    layout = await users_service.get_or_create_dashboard_layout(db_session, owner)

    assert (billing.currency, billing.invoice_prefix, billing.next_invoice_number) == ("USD", "INV-", 1)
    assert (meetings.timezone, meetings.slot_minutes, meetings.self_booking_enabled) == ("UTC", 30, True)
    assert layout.widget_order == "[]"
    assert billing.created_at is not None
    # And a second call returns the same row rather than a new one.
    assert (await invoicing_service.get_or_create_billing_settings(db_session, agency)).id == billing.id
