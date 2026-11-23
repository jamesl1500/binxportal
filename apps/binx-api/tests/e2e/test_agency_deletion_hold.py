"""End-to-end tests for the 30-day agency deletion hold: who loses access, what
an owner can still do, how a paid plan is handled, and the final erase.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
import stripe
from fastapi.routing import APIRoute
from sqlalchemy import select

from binx_api.core import storage, stripe_client
from binx_api.modules.agencies import deletion
from binx_api.modules.agencies.models import ROLE_ADMIN, Agency, AgencyClient, AgencyMember
from binx_api.modules.billing import models as billing_models
from binx_api.modules.billing.models import AgencySubscription
from binx_api.modules.billing.service import get_or_create_subscription
from binx_api.modules.messaging.models import Conversation
from binx_api.modules.projects.models import Project
from binx_api.modules.proposals import service as proposals_service
from tests.conftest import auth_headers, extract_token
from tests.factories import (
    add_agency_member,
    make_agency,
    make_client,
    make_client_contact,
    make_conversation,
    make_invoice,
    make_project,
    make_user,
)

pytestmark = pytest.mark.e2e

PASSWORD = "test-password-123"  # tests.factories.make_user's default


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    teammate = await make_user(db_session, full_name="Tess Teammate")
    contact = await make_user(db_session, full_name="Casey Client")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    await add_agency_member(db_session, agency=agency, user=teammate)
    client = await make_client(db_session, agency=agency, name="Northwind")
    await make_client_contact(db_session, agency=agency, client=client, user=contact)
    return SimpleNamespace(
        owner=owner, teammate=teammate, contact=contact, agency=agency, agency_id=agency.id, client=client
    )


@pytest.fixture
def stripe_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    """Records subscription changes instead of calling Stripe."""
    calls: list[tuple] = []

    async def fake_set(subscription_id, *, cancel):
        calls.append(("set", subscription_id, cancel))

    async def fake_cancel(subscription_id):
        calls.append(("cancel", subscription_id))

    monkeypatch.setattr(deletion.settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(stripe_client, "set_subscription_cancel_at_period_end", fake_set)
    monkeypatch.setattr(stripe_client, "cancel_subscription", fake_cancel)
    return calls


async def _make_paying(db_session, agency: Agency, *, cancel_at_period_end: bool = False) -> AgencySubscription:
    subscription = await get_or_create_subscription(db_session, agency.id)
    subscription.plan = "pro"
    subscription.status = "active"
    subscription.stripe_customer_id = f"cus_{agency.id.hex}"
    subscription.stripe_subscription_id = f"sub_{agency.id.hex}"
    subscription.cancel_at_period_end = cancel_at_period_end
    await db_session.commit()
    return subscription


async def _delete(client, ctx) -> None:
    response = await client.delete(f"/agencies/{ctx.agency_id}", headers=auth_headers(ctx.owner))
    assert response.status_code == 204, response.text


def _past_the_hold() -> datetime:
    return datetime.now(UTC) + timedelta(days=deletion.DELETION_HOLD_DAYS, minutes=1)


class TestEveryAgencyRouteIsGuarded:
    def test_every_route_with_an_agency_id_checks_the_agencys_role(self) -> None:
        """require_agency_role is what enforces the hold, so a new route that
        skips it would leave a deleted agency reachable."""
        from binx_api.main import app

        def uses_role_check(dependant) -> bool:
            call = dependant.call
            if call is not None and "require_agency_role" in getattr(call, "__qualname__", ""):
                return True
            return any(uses_role_check(child) for child in dependant.dependencies)

        unguarded = [
            route.path
            for route in app.routes
            if isinstance(route, APIRoute)
            and "{agency_id}" in route.path
            and not route.path.startswith("/admin")
            and not uses_role_check(route.dependant)
        ]
        assert unguarded == []


class TestDuringTheHold:
    async def test_deleting_schedules_it_thirty_days_out_and_keeps_the_data(self, client, db_session, ctx) -> None:
        before = datetime.now(UTC)
        await _delete(client, ctx)

        agency = await db_session.get(Agency, ctx.agency_id)
        assert agency is not None
        assert agency.deletion_requested_by_user_id == ctx.owner.id
        assert agency.deletion_scheduled_for >= before + timedelta(days=30)
        assert await db_session.get(AgencyClient, ctx.client.id) is not None

    async def test_teammates_lose_access_and_it_leaves_their_list(self, client, ctx) -> None:
        await _delete(client, ctx)
        for person in (ctx.owner, ctx.teammate):
            headers = auth_headers(person)
            assert (await client.get("/agencies/mine", headers=headers)).json() == []
            assert (await client.get(f"/agencies/{ctx.agency_id}/clients", headers=headers)).status_code == 404

    async def test_only_the_owner_sees_it_pending_and_can_export(self, client, ctx) -> None:
        await _delete(client, ctx)
        owner, teammate = auth_headers(ctx.owner), auth_headers(ctx.teammate)

        pending = (await client.get("/agencies/pending-deletion", headers=owner)).json()
        assert [row["name"] for row in pending] == ["Pixel Forge"]
        assert (await client.get("/agencies/pending-deletion", headers=teammate)).json() == []

        url = f"/agencies/{ctx.agency_id}/exports/clients"
        assert (await client.get(url, headers=owner)).status_code == 200
        assert (await client.get(url, headers=teammate)).status_code == 404

    async def test_a_teammate_cannot_restore_it(self, client, db_session, ctx) -> None:
        admin = await make_user(db_session)
        db_session.add(AgencyMember(agency_id=ctx.agency_id, user_id=admin.id, role=ROLE_ADMIN))
        await db_session.commit()
        await _delete(client, ctx)

        for person in (ctx.teammate, admin):
            response = await client.post(f"/agencies/{ctx.agency_id}/restore", headers=auth_headers(person))
            assert response.status_code == 404

    async def test_the_client_portal_closes_with_a_distinct_status(self, client, ctx) -> None:
        headers = auth_headers(ctx.contact)
        assert (await client.get("/portal/context", headers=headers)).status_code == 200
        await _delete(client, ctx)
        assert (await client.get("/portal/context", headers=headers)).status_code == 423
        assert (await client.get("/portal/projects", headers=headers)).status_code == 423

    async def test_public_links_and_search_stop_working(self, client, db_session, ctx) -> None:
        proposal = await proposals_service.create_proposal(
            db_session,
            ctx.agency,
            created_by=ctx.owner,
            lead_id=None,
            client_id=ctx.client.id,
            title="Rebrand",
            recipient_name="Casey",
            recipient_email="casey@example.com",
            content=None,
            currency="USD",
            tax_rate_percent=Decimal("0"),
            valid_until=None,
            line_items=[],
        )
        proposal.status = "sent"
        ctx.agency.subdomain = "pixelforge"
        subscription = await get_or_create_subscription(db_session, ctx.agency_id)
        subscription.plan = "pro"
        await db_session.commit()
        url = f"/proposals/public/{proposal.share_token}"
        assert (await client.get(url)).status_code == 200
        assert (await client.get("/agencies/by-subdomain/pixelforge")).status_code == 200

        await _delete(client, ctx)

        assert (await client.get(url)).status_code == 404
        assert (await client.get("/agencies/by-subdomain/pixelforge")).status_code == 404
        assert (await client.get("/portal/agencies/search", params={"q": "Pixel"})).json() == []

    async def test_pending_invitations_stop_working(self, client, db_session, email_outbox, ctx) -> None:
        invite = await client.post(
            f"/agencies/{ctx.agency_id}/invitations",
            json={"email": "new@example.com", "role": "member"},
            headers=auth_headers(ctx.owner),
        )
        assert invite.status_code == 201, invite.text
        token = extract_token(email_outbox[-1].body)

        await _delete(client, ctx)

        assert (await client.get("/agencies/invitations/preview", params={"token": token})).status_code == 400


class TestRestore:
    async def test_brings_everyone_back(self, client, db_session, ctx) -> None:
        await _delete(client, ctx)
        restored = await client.post(f"/agencies/{ctx.agency_id}/restore", headers=auth_headers(ctx.owner))
        assert restored.status_code == 200, restored.text

        agency = await db_session.get(Agency, ctx.agency_id)
        assert agency.deletion_scheduled_for is None
        assert agency.deletion_requested_by_user_id is None
        assert len((await client.get("/agencies/mine", headers=auth_headers(ctx.teammate))).json()) == 1
        assert (await client.get("/portal/context", headers=auth_headers(ctx.contact))).status_code == 200

    async def test_a_held_agency_frees_its_slot_and_a_full_plan_blocks_restoring(
        self, client, db_session, monkeypatch: pytest.MonkeyPatch, ctx
    ) -> None:
        free = replace(billing_models.PLANS["free"], max_owned_agencies=1)
        monkeypatch.setitem(billing_models.PLANS, "free", free)
        await get_or_create_subscription(db_session, ctx.agency_id)
        await _delete(client, ctx)
        headers = auth_headers(ctx.owner)

        created = await client.post("/agencies", json={"name": "Second Try"}, headers=headers)
        assert created.status_code == 201, created.text
        await get_or_create_subscription(db_session, created.json()["id"])

        blocked = await client.post(f"/agencies/{ctx.agency_id}/restore", headers=headers)
        assert blocked.status_code == 402
        assert (await db_session.get(Agency, ctx.agency_id)).deletion_scheduled_for is not None

        assert (await client.delete(f"/agencies/{created.json()['id']}", headers=headers)).status_code == 204
        assert (await client.post(f"/agencies/{ctx.agency_id}/restore", headers=headers)).status_code == 200


class TestPaidPlans:
    async def test_stops_renewal_and_a_restore_turns_it_back_on(self, client, db_session, stripe_calls, ctx) -> None:
        subscription = await _make_paying(db_session, ctx.agency)
        await _delete(client, ctx)
        assert stripe_calls == [("set", subscription.stripe_subscription_id, True)]
        assert subscription.cancel_at_period_end is True

        await client.post(f"/agencies/{ctx.agency_id}/restore", headers=auth_headers(ctx.owner))
        assert stripe_calls[-1] == ("set", subscription.stripe_subscription_id, False)
        assert subscription.cancel_at_period_end is False

    async def test_a_cancellation_the_customer_chose_stays_cancelled(
        self, client, db_session, stripe_calls, ctx
    ) -> None:
        subscription = await _make_paying(db_session, ctx.agency, cancel_at_period_end=True)
        await _delete(client, ctx)
        await client.post(f"/agencies/{ctx.agency_id}/restore", headers=auth_headers(ctx.owner))
        assert stripe_calls == []
        assert subscription.cancel_at_period_end is True

    async def test_nothing_is_deleted_if_stripe_cannot_stop_billing(
        self, client, db_session, monkeypatch: pytest.MonkeyPatch, stripe_calls, ctx
    ) -> None:
        await _make_paying(db_session, ctx.agency)

        async def failing(subscription_id, *, cancel):
            raise stripe.APIConnectionError("down")

        monkeypatch.setattr(stripe_client, "set_subscription_cancel_at_period_end", failing)
        response = await client.delete(f"/agencies/{ctx.agency_id}", headers=auth_headers(ctx.owner))

        assert response.status_code == 502
        assert (await db_session.get(Agency, ctx.agency_id)).deletion_scheduled_for is None

    async def test_an_unrelated_stripe_refusal_is_not_treated_as_stopped(
        self, client, db_session, monkeypatch: pytest.MonkeyPatch, stripe_calls, ctx
    ) -> None:
        await _make_paying(db_session, ctx.agency)

        async def refused(subscription_id, *, cancel):
            raise stripe.InvalidRequestError("Nope", param=None, code="parameter_invalid")

        async def still_active(subscription_id):
            return SimpleNamespace(status="active")

        monkeypatch.setattr(stripe_client, "set_subscription_cancel_at_period_end", refused)
        monkeypatch.setattr(stripe_client, "retrieve_subscription", still_active)
        response = await client.delete(f"/agencies/{ctx.agency_id}", headers=auth_headers(ctx.owner))
        assert response.status_code == 502


class TestPurge:
    async def test_does_nothing_before_the_hold_ends(self, client, db_session, ctx) -> None:
        await _delete(client, ctx)
        almost = datetime.now(UTC) + timedelta(days=deletion.DELETION_HOLD_DAYS - 1)
        assert await deletion.purge_next_due(db_session, now=almost, skip=set()) == (None, False)
        assert await db_session.get(Agency, ctx.agency_id) is not None

    async def test_erases_rows_and_files_and_leaves_other_agencies(self, client, db_session, ctx) -> None:
        other_owner = await make_user(db_session)
        other = await make_agency(db_session, owner=other_owner, name="Other")
        other_id = other.id
        other_project = await make_project(
            db_session, agency=other, created_by=other_owner, client=await make_client(db_session, agency=other)
        )
        project = await make_project(db_session, agency=ctx.agency, created_by=ctx.owner, client=ctx.client)
        await make_invoice(db_session, agency=ctx.agency, created_by=ctx.owner, client=ctx.client)
        conversation = await make_conversation(db_session, agency=ctx.agency, creator=ctx.owner, others=[ctx.teammate])
        agency_id, project_id, conversation_id = ctx.agency_id, project.id, conversation.id

        paths = [
            Path(
                await storage.save("agencies", f"{agency_id}/logo.png", b"x", content_type="application/octet-stream")
            ),
            Path(
                await storage.save(
                    "agencies", f"clients/{ctx.client.id}/logo.png", b"x", content_type="application/octet-stream"
                )
            ),
            Path(
                await storage.save("projects", f"{project_id}/brief.pdf", b"x", content_type="application/octet-stream")
            ),
            Path(
                await storage.save(
                    "projects", f"{project_id}/tasks/t1/note.pdf", b"x", content_type="application/octet-stream"
                )
            ),
            Path(
                await storage.save(
                    "messages", f"{conversation_id}/photo.png", b"x", content_type="application/octet-stream"
                )
            ),
        ]
        kept = Path(
            await storage.save(
                "projects", f"{other_project.id}/keep.pdf", b"x", content_type="application/octet-stream"
            )
        )

        await _delete(client, ctx)
        assert await deletion.purge_next_due(db_session, now=_past_the_hold(), skip=set()) == (agency_id, True)

        db_session.expire_all()
        assert await db_session.get(Agency, agency_id) is None
        assert await db_session.scalar(select(Project.id).where(Project.id == project_id)) is None
        assert await db_session.scalar(select(Conversation.id).where(Conversation.id == conversation_id)) is None
        assert [path for path in paths if path.exists()] == []
        assert kept.exists()
        assert await db_session.get(Agency, other_id) is not None

    async def test_ends_a_subscription_that_is_still_attached(self, client, db_session, stripe_calls, ctx) -> None:
        subscription = await _make_paying(db_session, ctx.agency)
        subscription_id = subscription.stripe_subscription_id
        await _delete(client, ctx)
        await deletion.purge_next_due(db_session, now=_past_the_hold(), skip=set())
        assert stripe_calls[-1] == ("cancel", subscription_id)

    async def test_keeps_the_agency_if_stripe_cannot_confirm_billing_ended(
        self, client, db_session, monkeypatch: pytest.MonkeyPatch, stripe_calls, ctx
    ) -> None:
        await _make_paying(db_session, ctx.agency)
        await _delete(client, ctx)

        async def failing(subscription_id):
            raise stripe.APIConnectionError("down")

        monkeypatch.setattr(stripe_client, "cancel_subscription", failing)
        result = await deletion.purge_next_due(db_session, now=_past_the_hold(), skip=set())

        assert result == (ctx.agency_id, False)
        assert await db_session.get(Agency, ctx.agency_id) is not None


class TestAccountDeletion:
    async def _delete_account(self, client, user) -> None:
        response = await client.request(
            "DELETE", "/users/me", json={"current_password": PASSWORD}, headers=auth_headers(user)
        )
        assert response.status_code == 200, response.text

    async def test_a_sole_owned_agency_goes_on_hold(self, client, db_session, ctx) -> None:
        await self._delete_account(client, ctx.owner)
        agency = await db_session.get(Agency, ctx.agency_id)
        assert agency.deletion_scheduled_for is not None
        assert agency.deletion_requested_by_user_id is None
        assert (await client.get("/agencies/mine", headers=auth_headers(ctx.teammate))).json() == []

    async def test_an_agency_with_another_owner_carries_on(self, client, db_session, ctx) -> None:
        membership = await db_session.scalar(select(AgencyMember).where(AgencyMember.user_id == ctx.teammate.id))
        membership.role = "owner"
        await db_session.commit()
        await self._delete_account(client, ctx.owner)
        assert (await db_session.get(Agency, ctx.agency_id)).deletion_scheduled_for is None

    async def test_support_can_restore_it_to_a_new_owner(self, client, db_session, ctx) -> None:
        admin = await make_user(db_session, role="admin")
        await self._delete_account(client, ctx.owner)
        url = f"/admin/agencies/{ctx.agency_id}/restore"

        no_owner = await client.post(url, json={}, headers=auth_headers(admin))
        assert no_owner.status_code == 400

        client_contact = await client.post(url, json={"owner_email": ctx.contact.email}, headers=auth_headers(admin))
        assert client_contact.status_code == 400

        restored = await client.post(url, json={"owner_email": ctx.teammate.email}, headers=auth_headers(admin))
        assert restored.status_code == 200, restored.text
        mine = (await client.get("/agencies/mine", headers=auth_headers(ctx.teammate))).json()
        assert [(row["name"], row["role"]) for row in mine] == [("Pixel Forge", "owner")]
