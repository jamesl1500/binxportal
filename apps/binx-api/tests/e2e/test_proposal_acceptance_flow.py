"""End-to-end: accepting a proposal. Once it's fully signed, a lead becomes a
client, the signer is invited to the client portal, a deposit invoice goes
out, and the project (with its kickoff) starts, after the deposit when
there is one. Plan limits block it with a reason it can be retried from."""

from __future__ import annotations

import dataclasses
from datetime import date
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from binx_api.modules.billing import models as billing_models
from binx_api.modules.kickoffs.models import Kickoff
from binx_api.modules.leads.models import Lead
from binx_api.modules.notifications.models import Notification
from binx_api.modules.projects.models import Project
from tests.conftest import auth_headers, extract_token
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


async def _lead(client, agency, owner, name="Fjord & Field") -> dict:
    resp = await client.post(
        f"/agencies/{agency.id}/leads",
        json={"name": name, "contact_name": "Jane Prospect", "contact_email": "jane@fjord.example"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _template(client, agency, owner) -> dict:
    resp = await client.post(
        f"/agencies/{agency.id}/kickoff-templates",
        json={"name": "Brand kickoff", "questions": [{"type": "text", "label": "What's your launch date?"}]},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _sent(client, agency, owner, **fields) -> dict:
    payload = {
        "title": "Brand refresh",
        "content": "Strategy and identity.",
        "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 1_000_000}],
    } | fields
    created = await client.post(f"/agencies/{agency.id}/proposals", json=payload, headers=auth_headers(owner))
    assert created.status_code == 201, created.text
    sent = await client.post(
        f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert sent.status_code == 200, sent.text
    return sent.json()


async def _sign(client, sent: dict, email="jane@fjord.example"):
    resp = await client.post(
        f"/proposals/public/{_token(sent['share_url'])}/sign",
        json={
            "signer_name": "Jane Prospect",
            "signer_email": email,
            "consent": True,
            "document_hash": sent["document_hash"],
        },
        headers=CHROME,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _staff(client, agency, owner, proposal_id) -> dict:
    resp = await client.get(f"/agencies/{agency.id}/proposals/{proposal_id}", headers=auth_headers(owner))
    return resp.json()


async def _history(client, agency, owner, proposal_id) -> list[str]:
    resp = await client.get(f"/agencies/{agency.id}/proposals/{proposal_id}/events", headers=auth_headers(owner))
    return [event["kind"] for event in resp.json()]


class TestLeadBecomesAClient:
    async def test_signing_converts_the_lead_invites_the_signer_and_starts_the_project(
        self, client, ctx, db_session, email_outbox
    ) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        sent = await _sent(
            client,
            agency,
            owner,
            lead_id=lead["id"],
            recipient_email="jane@fjord.example",
            create_project_on_accept=True,
        )
        await _sign(client, sent)

        staff = await _staff(client, agency, owner, sent["id"])
        acceptance = staff["acceptance"]
        assert acceptance["status"] == "done"
        assert acceptance["converted_lead"] is True
        assert acceptance["client_name"] == "Fjord & Field"
        assert acceptance["invited_email"] == "jane@fjord.example"
        assert acceptance["project_name"] == "Brand refresh"
        assert staff["client_id"] == acceptance["client_id"]

        lead_row = await db_session.get(Lead, lead["id"], populate_existing=True)
        assert lead_row.status == "won"
        assert str(lead_row.converted_client_id) == acceptance["client_id"]
        project = await db_session.get(Project, acceptance["project_id"])
        assert project.status == "active"
        assert project.description == "Strategy and identity."

        welcome = next(m for m in email_outbox if m.subject.startswith("Welcome aboard"))
        assert welcome.to == "jane@fjord.example"
        assert "/auth/portal-invite?token=" in welcome.body
        assert [m.subject for m in email_outbox if m.to == "jane@fjord.example"].count("Signed: Brand refresh") == 1

        history = await _history(client, agency, owner, sent["id"])
        assert history[-3:] == ["client_created", "portal_invited", "project_created"]

        # The portal read never shows the acceptance internals.
        assert "acceptance" not in (await client.get(f"/proposals/public/{_token(sent['share_url'])}")).json()

    async def test_a_deposit_holds_the_project_until_it_is_paid_and_the_kickoff_until_the_signer_joins(
        self, client, ctx, db_session, email_outbox
    ) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        template = await _template(client, agency, owner)
        sent = await _sent(
            client,
            agency,
            owner,
            lead_id=lead["id"],
            recipient_email="jane@fjord.example",
            deposit_percent="30",
            create_project_on_accept=True,
            kickoff_template_id=template["id"],
        )
        await _sign(client, sent)

        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "awaiting_deposit"
        assert acceptance["deposit_invoice_status"] == "sent"
        assert acceptance["project_id"] is None
        invoice = await client.get(
            f"/agencies/{agency.id}/invoices/{acceptance['deposit_invoice_id']}", headers=auth_headers(owner)
        )
        assert invoice.json()["total_cents"] == 300_000  # 30% of 10,000.00
        assert invoice.json()["line_items"][0]["description"] == "Deposit (30%) for “Brand refresh”"
        welcome = next(m for m in email_outbox if m.subject.startswith("Welcome aboard"))
        assert "3,000.00" in welcome.body

        # The deposit lands...
        paid = await client.post(
            f"/agencies/{agency.id}/invoices/{acceptance['deposit_invoice_id']}/payments",
            json={"amount_cents": 300_000, "paid_on": date.today().isoformat(), "method": "bank_transfer"},
            headers=auth_headers(owner),
        )
        assert paid.status_code == 201, paid.text
        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "done"
        assert acceptance["deposit_paid_at"] is not None
        assert acceptance["project_name"] == "Brand refresh"
        # ...but the kickoff waits: there's no one in the portal to send it to yet.
        assert acceptance["kickoff_sent_at"] is None
        kickoff = (await db_session.execute(select(Kickoff))).scalar_one()
        assert kickoff.status == "draft"

        # The signer accepts their invitation: the kickoff goes out.
        signer = await make_user(db_session, email="jane@fjord.example", full_name="Jane Prospect")
        accepted = await client.post(
            "/portal/invitations/accept",
            json={"token": extract_token(welcome.body)},
            headers=auth_headers(signer),
        )
        assert accepted.status_code == 200, accepted.text
        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["kickoff_sent_at"] is not None
        await db_session.refresh(kickoff)
        assert kickoff.status == "sent"
        history = await _history(client, agency, owner, sent["id"])
        assert history[-6:] == [
            "client_created",
            "portal_invited",
            "deposit_invoiced",
            "deposit_paid",
            "project_created",
            "kickoff_sent",
        ]

    async def test_a_countersigned_proposal_is_accepted_only_after_the_countersignature(
        self, client, ctx, db_session
    ) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        sent = await _sent(
            client, agency, owner, lead_id=lead["id"], recipient_email="jane@fjord.example", requires_countersign=True
        )
        await _sign(client, sent)
        assert (await _staff(client, agency, owner, sent["id"]))["acceptance"] is None

        await client.post(
            f"/agencies/{agency.id}/proposals/{sent['id']}/countersign",
            json={"consent": True, "document_hash": sent["document_hash"]},
            headers=auth_headers(owner),
        )
        assert (await _staff(client, agency, owner, sent["id"]))["acceptance"]["status"] == "done"


class TestExistingClient:
    async def test_a_portal_signer_is_not_reinvited_and_no_lead_is_converted(
        self, client, ctx, db_session, email_outbox
    ) -> None:
        agency, owner = ctx
        client_row = await make_client(db_session, agency=agency, name="Acme")
        contact = await make_user(db_session, email="dana@acme.example", full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=client_row, user=contact)
        sent = await _sent(
            client,
            agency,
            owner,
            client_id=str(client_row.id),
            recipient_email="dana@acme.example",
            create_project_on_accept=True,
        )
        signed = await client.post(
            f"/portal/proposals/{sent['id']}/sign",
            json={"consent": True, "document_hash": sent["document_hash"]},
            headers=auth_headers(contact),
        )
        assert signed.status_code == 200, signed.text
        assert "acceptance" not in signed.json() or signed.json()["acceptance"] is None

        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "done"
        assert acceptance["converted_lead"] is False
        assert acceptance["client_id"] == str(client_row.id)
        assert not [m for m in email_outbox if m.subject.startswith("Welcome aboard")]

    async def test_a_standalone_proposal_has_nothing_to_accept(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner, recipient_email="jane@fjord.example")
        await _sign(client, sent)
        assert (await _staff(client, agency, owner, sent["id"]))["acceptance"] is None
        assert "acceptance_blocked" not in await _history(client, agency, owner, sent["id"])


class TestPlanLimits:
    async def test_a_plan_limit_blocks_acceptance_until_retried(self, client, ctx, db_session, monkeypatch) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        sent = await _sent(client, agency, owner, lead_id=lead["id"], recipient_email="jane@fjord.example")

        with monkeypatch.context() as patch:
            patch.setitem(
                billing_models.PLANS,
                "free",
                dataclasses.replace(billing_models.PLANS["free"], max_clients=0),
            )
            await _sign(client, sent)

        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "blocked"
        assert acceptance["blocked_reason"].startswith("Couldn't convert the lead to a client")
        assert "acceptance_blocked" in await _history(client, agency, owner, sent["id"])
        notice = (
            await db_session.execute(
                select(Notification).where(Notification.event_type == "proposal_acceptance_blocked")
            )
        ).scalar_one()
        assert notice.user_id == owner.id

        retried = await client.post(
            f"/agencies/{agency.id}/proposals/{sent['id']}/acceptance/retry", headers=auth_headers(owner)
        )
        assert retried.status_code == 200, retried.text
        assert retried.json()["acceptance"]["status"] == "done"
        assert retried.json()["acceptance"]["blocked_reason"] is None


class TestSettings:
    async def test_a_kickoff_needs_a_project(self, client, ctx) -> None:
        agency, owner = ctx
        template = await _template(client, agency, owner)
        resp = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "P", "kickoff_template_id": template["id"]},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 422

    async def test_another_agencys_kickoff_template_is_refused(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        outsider = await make_user(db_session, full_name="Outsider")
        other = await make_agency(db_session, owner=outsider, name="Other")
        foreign = await _template(client, other, outsider)
        resp = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "P", "create_project_on_accept": True, "kickoff_template_id": foreign["id"]},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 404

    async def test_settings_round_trip(self, client, ctx) -> None:
        agency, owner = ctx
        created = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "P", "deposit_percent": "25", "create_project_on_accept": True},
            headers=auth_headers(owner),
        )
        body = created.json()
        assert body["deposit_percent"] == "25.000"
        assert body["create_project_on_accept"] is True


MONTHLY_LINES = [
    {"description": "Brand strategy", "quantity": "1", "unit_price_cents": 1_000_000},
    {"description": "Design retainer", "quantity": "2", "unit_price_cents": 150_000, "billing": "monthly"},
]


class TestMonthlyLines:
    async def test_monthly_lines_are_totalled_per_month_and_left_out_of_the_total_and_deposit(
        self, client, ctx
    ) -> None:
        agency, owner = ctx
        sent = await _sent(
            client, agency, owner, recipient_email="jane@fjord.example", line_items=MONTHLY_LINES, tax_rate_percent="10"
        )
        assert [line["billing"] for line in sent["line_items"]] == ["one_time", "monthly"]
        assert (sent["subtotal_cents"], sent["tax_cents"], sent["total_cents"]) == (1_000_000, 100_000, 1_100_000)
        assert (sent["monthly_subtotal_cents"], sent["monthly_tax_cents"], sent["monthly_total_cents"]) == (
            300_000,
            30_000,
            330_000,
        )
        public = (await client.get(f"/proposals/public/{_token(sent['share_url'])}")).json()
        assert public["monthly_total_cents"] == 330_000
        assert public["line_items"][1]["billing"] == "monthly"

    async def test_an_unknown_billing_is_refused(self, client, ctx) -> None:
        agency, owner = ctx
        resp = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={
                "title": "P",
                "line_items": [{"description": "X", "quantity": "1", "unit_price_cents": 1, "billing": "weekly"}],
            },
            headers=auth_headers(owner),
        )
        assert resp.status_code == 422

    async def test_accepting_starts_monthly_billing_for_the_client_and_project(self, client, ctx, db_session) -> None:
        from binx_api.modules.invoicing.models import RecurringInvoiceLineItem, RecurringInvoiceSchedule

        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        sent = await _sent(
            client,
            agency,
            owner,
            lead_id=lead["id"],
            recipient_email="jane@fjord.example",
            create_project_on_accept=True,
            line_items=MONTHLY_LINES,
            tax_rate_percent="10",
        )
        await _sign(client, sent)

        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "done"
        assert acceptance["retainer_next_run_date"] == date.today().isoformat()
        schedule = await db_session.get(RecurringInvoiceSchedule, acceptance["retainer_schedule_id"])
        assert str(schedule.client_id) == acceptance["client_id"]
        assert str(schedule.project_id) == acceptance["project_id"]
        assert (schedule.interval, schedule.interval_count, schedule.auto_issue) == ("monthly", 1, True)
        assert schedule.day_of_month == min(date.today().day, 28)
        assert schedule.tax_rate_percent == 10
        rows = await db_session.execute(
            select(RecurringInvoiceLineItem).where(RecurringInvoiceLineItem.schedule_id == schedule.id)
        )
        assert [(line.description, line.quantity, line.unit_price_cents) for line in rows.scalars()] == [
            ("Design retainer", 2, 150_000)
        ]
        history = await _history(client, agency, owner, sent["id"])
        assert history[-2:] == ["project_created", "retainer_scheduled"]

        # Running acceptance again adds no second schedule.
        await client.post(f"/agencies/{agency.id}/proposals/{sent['id']}/acceptance/retry", headers=auth_headers(owner))
        assert len((await db_session.execute(select(RecurringInvoiceSchedule))).scalars().all()) == 1

    async def test_monthly_billing_waits_for_the_deposit(self, client, ctx) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        sent = await _sent(
            client,
            agency,
            owner,
            lead_id=lead["id"],
            recipient_email="jane@fjord.example",
            deposit_percent="50",
            line_items=MONTHLY_LINES,
        )
        await _sign(client, sent)

        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "awaiting_deposit"
        assert acceptance["retainer_schedule_id"] is None
        invoice = await client.get(
            f"/agencies/{agency.id}/invoices/{acceptance['deposit_invoice_id']}", headers=auth_headers(owner)
        )
        assert invoice.json()["total_cents"] == 500_000  # half the one-time 10,000.00, not the retainer

        paid = await client.post(
            f"/agencies/{agency.id}/invoices/{acceptance['deposit_invoice_id']}/payments",
            json={"amount_cents": 500_000, "paid_on": date.today().isoformat(), "method": "bank_transfer"},
            headers=auth_headers(owner),
        )
        assert paid.status_code == 201, paid.text
        acceptance = (await _staff(client, agency, owner, sent["id"]))["acceptance"]
        assert acceptance["status"] == "done"
        assert acceptance["retainer_schedule_id"] is not None
        assert acceptance["project_id"] is None

    async def test_the_certificate_and_pdf_show_the_monthly_lines(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner, recipient_email="jane@fjord.example", line_items=MONTHLY_LINES)
        await _sign(client, sent)
        token = _token(sent["share_url"])
        certificate = (await client.get(f"/proposals/public/{token}/certificate")).json()
        assert certificate["document_intact"] is True
        assert [line["billing"] for line in certificate["line_items"]] == ["one_time", "monthly"]
        assert certificate["monthly_total_cents"] == 300_000
        pdf = await client.get(f"/proposals/public/{token}/certificate.pdf")
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")


class TestOlderSnapshots:
    async def test_a_v1_snapshot_still_verifies_and_reads_as_one_time(self, client, ctx, db_session) -> None:
        """Documents signed before monthly lines existed have no billing or
        monthly totals in their snapshot. Their certificate still reads (as
        one-time) and still matches its fingerprint."""
        import json

        from binx_api.modules.proposals import signing
        from binx_api.modules.proposals.models import Proposal

        agency, owner = ctx
        sent = await _sent(client, agency, owner, recipient_email="jane@fjord.example")
        proposal = await db_session.get(Proposal, sent["id"])
        data = json.loads(proposal.document_snapshot)
        data["version"] = 1
        for key in ("monthly_subtotal_cents", "monthly_tax_cents", "monthly_total_cents"):
            del data[key]
        for line in data["line_items"]:
            del line["billing"]
        proposal.document_snapshot = signing._canonical_json(data)
        proposal.document_hash = signing.hash_snapshot(proposal.document_snapshot)
        await db_session.commit()

        await _sign(client, sent | {"document_hash": proposal.document_hash})
        certificate = (await client.get(f"/proposals/public/{_token(sent['share_url'])}/certificate")).json()
        assert certificate["document_intact"] is True
        assert certificate["signature_matches_document"] is True
        assert certificate["line_items"][0]["billing"] == "one_time"
        assert certificate["monthly_total_cents"] == 0
