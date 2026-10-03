"""
End-to-end tests for the client portal: staff invite a contact, the contact
onboards with their own account, and the `/portal/*` surface is scoped to
that one client — projects, invoices (Stripe Connect checkout + webhook),
and client-linked messages.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from binx_api.core import stripe_client
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.service import issue_invoice
from binx_api.modules.messaging.service import create_conversation
from binx_api.modules.users import service as users_service
from tests.conftest import auth_headers, extract_token
from tests.factories import make_agency, make_client, make_invoice, make_project, make_task, make_user
from tests.stripe_helpers import sign_stripe_payload

pytestmark = pytest.mark.e2e

PNG = ("avatar.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


@pytest.fixture
async def portal_setup(db_session):
    """An agency with one client, one issued invoice, and one project."""
    owner = await make_user(db_session, full_name="Olivia Owner", email="olivia@agency.example")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    client = await make_client(db_session, agency=agency, name="Northwind Traders")
    project = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Rebrand")
    invoice = await make_invoice(db_session, agency=agency, created_by=owner, client=client)
    await issue_invoice(db_session, invoice, issued_by=owner)
    return {"owner": owner, "agency": agency, "client": client, "project": project, "invoice": invoice}


async def _invite_and_accept(client, db_session, email_outbox, agency_id, client_id, owner, contact_email):
    invite = await client.post(
        f"/agencies/{agency_id}/clients/{client_id}/contacts/invitations",
        json={"email": contact_email},
        headers=auth_headers(owner),
    )
    assert invite.status_code == 201, invite.text
    token = extract_token(email_outbox[-1].body)

    contact_user = await make_user(db_session, full_name="Casey Client", email=contact_email)
    accept = await client.post("/portal/invitations/accept", json={"token": token}, headers=auth_headers(contact_user))
    assert accept.status_code == 200, accept.text
    return contact_user, accept.json()


class TestOnboarding:
    async def test_invite_accept_and_scoped_context(self, client, db_session, email_outbox, portal_setup) -> None:
        s = portal_setup
        contact_user, ctx = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey@northwind.example"
        )

        assert ctx["agency"]["name"] == "Pixel Forge"
        assert ctx["client"]["name"] == "Northwind Traders"
        assert ctx["contact"]["is_primary"] is True

        # /portal/context is the same, and gated.
        again = await client.get("/portal/context", headers=auth_headers(contact_user))
        assert again.status_code == 200
        assert again.json()["client"]["id"] == str(s["client"].id)

    async def test_a_non_contact_account_is_forbidden(self, client, db_session, portal_setup) -> None:
        stranger = await make_user(db_session, email="stranger@example.com")
        for path in (
            "/portal/context",
            "/portal/projects",
            "/portal/invoices",
            "/portal/proposals",
            "/portal/conversations",
        ):
            r = await client.get(path, headers=auth_headers(stranger))
            assert r.status_code == 403, path


class TestPortalReads:
    async def test_projects_and_invoices_are_scoped_to_the_client(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        # A second client + its own project/invoice the contact must NOT see.
        other = await make_client(db_session, agency=s["agency"], name="Globex")
        await make_project(db_session, agency=s["agency"], created_by=s["owner"], client=other, name="Secret")

        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey2@northwind.example"
        )

        projects = (await client.get("/portal/projects", headers=auth_headers(contact_user))).json()
        assert [p["name"] for p in projects] == ["Rebrand"]
        assert "progress" in projects[0]

        invoices = (await client.get("/portal/invoices", headers=auth_headers(contact_user))).json()
        assert len(invoices) == 1
        assert invoices[0]["client_id"] == str(s["client"].id)
        assert invoices[0]["display_status"] in ("sent", "overdue")

    async def test_task_board_lists_columns_and_tasks_without_assignee(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        task = await make_task(db_session, project=s["project"], title="Design the homepage")
        contact_user, _ = await _invite_and_accept(
            client,
            db_session,
            email_outbox,
            s["agency"].id,
            s["client"].id,
            s["owner"],
            "casey-board@northwind.example",
        )

        resp = await client.get(f"/portal/projects/{s['project'].id}/board", headers=auth_headers(contact_user))
        assert resp.status_code == 200, resp.text
        columns = resp.json()
        assert [c["name"] for c in columns] == ["To Do", "In Progress", "Done"]

        task_payload = next(t for col in columns for t in col["tasks"] if t["id"] == str(task.id))
        assert task_payload["title"] == "Design the homepage"
        # Trimmed the same way as everywhere else in the portal — no assignee,
        # no internal fields beyond title/description/due date.
        assert set(task_payload.keys()) == {"id", "title", "description", "due_date", "position"}

    async def test_task_board_is_scoped_to_the_client(self, client, db_session, email_outbox, portal_setup) -> None:
        s = portal_setup
        other_client = await make_client(db_session, agency=s["agency"], name="Globex")
        other_project = await make_project(
            db_session, agency=s["agency"], created_by=s["owner"], client=other_client, name="Secret"
        )
        contact_user, _ = await _invite_and_accept(
            client,
            db_session,
            email_outbox,
            s["agency"].id,
            s["client"].id,
            s["owner"],
            "casey-board2@northwind.example",
        )

        resp = await client.get(f"/portal/projects/{other_project.id}/board", headers=auth_headers(contact_user))
        assert resp.status_code == 404

    async def test_pay_invoice_requires_stripe_connect(self, client, db_session, email_outbox, portal_setup) -> None:
        """No Connect onboarding yet -> a real 409, not a silent fake success."""
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey3@northwind.example"
        )

        blocked = await client.post(f"/portal/invoices/{s['invoice'].id}/pay", headers=auth_headers(contact_user))
        assert blocked.status_code == 409

    async def test_pay_invoice_starts_checkout_once_connected(
        self, client, db_session, email_outbox, portal_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey4@northwind.example"
        )

        billing_settings = await invoicing_service.get_or_create_billing_settings(db_session, s["agency"])
        billing_settings.stripe_connect_account_id = "acct_test123"
        billing_settings.stripe_connect_charges_enabled = True
        await db_session.commit()

        captured: dict = {}

        async def fake_create_checkout_session(params, *, stripe_account=None):
            captured["params"] = params
            captured["stripe_account"] = stripe_account
            return SimpleNamespace(url="https://checkout.stripe.test/fake-session")

        monkeypatch.setattr(invoicing_service.stripe_client, "create_checkout_session", fake_create_checkout_session)

        started = await client.post(f"/portal/invoices/{s['invoice'].id}/pay", headers=auth_headers(contact_user))
        assert started.status_code == 200, started.text
        assert started.json() == {"checkout_url": "https://checkout.stripe.test/fake-session"}
        assert captured["stripe_account"] == "acct_test123"
        assert captured["params"]["mode"] == "payment"
        assert captured["params"]["metadata"]["invoice_id"] == str(s["invoice"].id)
        # Stripe fills {CHECKOUT_SESSION_ID} in on redirect, for the return
        # page's direct confirmation.
        assert captured["params"]["success_url"].endswith("?checkout=success&session_id={CHECKOUT_SESSION_ID}")

        # An already-paid invoice can't be paid again — unaffected by the
        # Stripe rewrite, still a plain 400 before ever calling Stripe.
        s["invoice"].status = "paid"
        await db_session.commit()
        again = await client.post(f"/portal/invoices/{s['invoice'].id}/pay", headers=auth_headers(contact_user))
        assert again.status_code == 400

    async def test_connect_webhook_records_the_payment(
        self, client, db_session, email_outbox, portal_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey5@northwind.example"
        )

        billing_settings = await invoicing_service.get_or_create_billing_settings(db_session, s["agency"])
        billing_settings.stripe_connect_account_id = "acct_test123"
        await db_session.commit()

        monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_test_fake")

        # Captured up front: the dedupe rollback on the replayed delivery
        # below expires every object in this shared test session, so touching
        # an ORM instance's attributes again afterward needs an `await` — the
        # plain strings captured here avoid that entirely.
        invoice_id = str(s["invoice"].id)
        contact_headers = auth_headers(contact_user)
        contact_full_name = contact_user.full_name
        balance = s["invoice"].total_cents - s["invoice"].amount_paid_cents
        event_payload = {
            "id": "evt_test_1",
            "type": "checkout.session.completed",
            "account": "acct_test123",
            "data": {
                "object": {
                    "id": "cs_test_1",
                    "mode": "payment",
                    "status": "complete",
                    "payment_status": "paid",
                    "amount_total": balance,
                    "payment_intent": "pi_test_1",
                    "metadata": {
                        "invoice_id": invoice_id,
                        "agency_id": str(s["agency"].id),
                        "paid_by_user_id": str(contact_user.id),
                    },
                }
            },
        }
        body, signature = sign_stripe_payload(event_payload, "whsec_test_fake")

        delivered = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        assert delivered.status_code == 200

        paid = await client.get(f"/portal/invoices/{invoice_id}", headers=contact_headers)
        paid_body = paid.json()
        assert paid_body["status"] == "paid"
        assert paid_body["payments"][0]["method"] == "stripe"
        assert paid_body["payments"][0]["recorded_by_name"] == contact_full_name

        # A redelivered event (Stripe retries on anything but a 2xx) must not
        # double-record the payment.
        replayed = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        assert replayed.status_code == 200
        again = await client.get(f"/portal/invoices/{invoice_id}", headers=contact_headers)
        assert len(again.json()["payments"]) == 1

    async def test_connect_webhook_rejects_bad_signature(self, client, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_test_fake")
        body, _ = sign_stripe_payload({"id": "evt_x", "type": "account.updated"}, "whsec_wrong_secret")
        resp = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": "t=1,v1=bad"})
        assert resp.status_code == 400


def _fake_session(invoice_id: str, agency_id: str, paid_by: str, **overrides):
    """A stand-in for a retrieved stripe.checkout.Session: just the fields
    confirm/record read (``metadata`` needs ``to_dict()`` like StripeObject)."""
    metadata = {"invoice_id": invoice_id, "agency_id": agency_id, "paid_by_user_id": paid_by}
    fields = {
        "id": "cs_test_confirm",
        "mode": "payment",
        "status": "complete",
        "payment_status": "paid",
        "amount_total": 0,
        "payment_intent": "pi_test_confirm",
        "metadata": SimpleNamespace(to_dict=lambda: dict(metadata)),
    }
    fields.update(overrides)
    return SimpleNamespace(**fields)


def _checkout_event(event_id, event_type, *, invoice_id, agency_id, paid_by, amount, payment_status="paid"):
    return {
        "id": event_id,
        "type": event_type,
        "account": "acct_test123",
        "data": {
            "object": {
                "id": f"cs_{event_id}",
                "mode": "payment",
                "status": "complete",
                "payment_status": payment_status,
                "amount_total": amount,
                "payment_intent": "pi_shared",
                "metadata": {"invoice_id": invoice_id, "agency_id": agency_id, "paid_by_user_id": paid_by},
            }
        },
    }


class TestPortalPaymentConfirmation:
    """The return-page confirmation, plus Connect payments that arrive on the
    platform endpoint: the two ways a paid invoice used to stay unpaid."""

    async def _connected(self, client, db_session, email_outbox, s, email):
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], email
        )
        billing_settings = await invoicing_service.get_or_create_billing_settings(db_session, s["agency"])
        billing_settings.stripe_connect_account_id = "acct_test123"
        billing_settings.stripe_connect_charges_enabled = True
        await db_session.commit()
        return contact_user

    async def test_confirm_records_a_paid_session_once(
        self, client, db_session, email_outbox, portal_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = portal_setup
        contact_user = await self._connected(client, db_session, email_outbox, s, "pay1@northwind.example")
        invoice_id, agency_id = str(s["invoice"].id), str(s["agency"].id)
        balance = s["invoice"].total_cents - s["invoice"].amount_paid_cents
        headers = auth_headers(contact_user)
        paid_by = str(contact_user.id)
        seen: dict = {}

        async def fake_retrieve(session_id, *, stripe_account=None):
            seen["args"] = (session_id, stripe_account)
            return _fake_session(invoice_id, agency_id, paid_by, amount_total=balance)

        monkeypatch.setattr(invoicing_service.stripe_client, "retrieve_checkout_session", fake_retrieve)

        url = f"/portal/invoices/{invoice_id}/pay/confirm"
        first = await client.post(url, json={"session_id": "cs_test_confirm"}, headers=headers)
        assert first.status_code == 200, first.text
        body = first.json()
        assert body["outcome"] == "paid"
        assert body["invoice"]["status"] == "paid"
        assert body["invoice"]["amount_due_cents"] == 0
        assert seen["args"] == ("cs_test_confirm", "acct_test123")

        # Refreshing the return page (or the webhook landing too) never double-records.
        second = await client.post(url, json={"session_id": "cs_test_confirm"}, headers=headers)
        assert second.json()["outcome"] == "paid"
        assert len(second.json()["invoice"]["payments"]) == 1

    @pytest.mark.parametrize(
        ("session_status", "outcome"),
        [("complete", "processing"), ("expired", "failed"), ("open", "open")],
    )
    async def test_confirm_reports_unsettled_sessions_without_recording(
        self,
        client,
        db_session,
        email_outbox,
        portal_setup,
        monkeypatch: pytest.MonkeyPatch,
        session_status,
        outcome,
    ) -> None:
        s = portal_setup
        contact_user = await self._connected(
            client, db_session, email_outbox, s, f"pay-{session_status}@northwind.example"
        )
        invoice_id, agency_id, paid_by = str(s["invoice"].id), str(s["agency"].id), str(contact_user.id)

        async def fake_retrieve(session_id, *, stripe_account=None):
            return _fake_session(invoice_id, agency_id, paid_by, status=session_status, payment_status="unpaid")

        monkeypatch.setattr(invoicing_service.stripe_client, "retrieve_checkout_session", fake_retrieve)
        resp = await client.post(
            f"/portal/invoices/{invoice_id}/pay/confirm",
            json={"session_id": "cs_x"},
            headers=auth_headers(contact_user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["outcome"] == outcome
        assert resp.json()["invoice"]["payments"] == []

    async def test_confirm_refuses_a_session_for_another_invoice(
        self, client, db_session, email_outbox, portal_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = portal_setup
        contact_user = await self._connected(client, db_session, email_outbox, s, "pay-other@northwind.example")
        agency_id, paid_by = str(s["agency"].id), str(contact_user.id)

        async def fake_retrieve(session_id, *, stripe_account=None):
            return _fake_session("00000000-0000-0000-0000-000000000000", agency_id, paid_by)

        monkeypatch.setattr(invoicing_service.stripe_client, "retrieve_checkout_session", fake_retrieve)
        resp = await client.post(
            f"/portal/invoices/{s['invoice'].id}/pay/confirm",
            json={"session_id": "cs_elsewhere"},
            headers=auth_headers(contact_user),
        )
        assert resp.status_code == 404

    async def test_platform_endpoint_records_a_connect_invoice_payment(
        self, client, db_session, email_outbox, portal_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """`stripe listen --forward-to .../platform` without
        --forward-connect-to delivers Connect events here. This used to 200
        without recording anything."""
        s = portal_setup
        contact_user = await self._connected(client, db_session, email_outbox, s, "pay-platform@northwind.example")
        monkeypatch.setattr(stripe_client.settings, "stripe_webhook_secret", "whsec_platform_fake")
        invoice_id = str(s["invoice"].id)
        headers = auth_headers(contact_user)
        payload = _checkout_event(
            "evt_platform_1",
            "checkout.session.completed",
            invoice_id=invoice_id,
            agency_id=str(s["agency"].id),
            paid_by=str(contact_user.id),
            amount=s["invoice"].total_cents - s["invoice"].amount_paid_cents,
        )
        body, signature = sign_stripe_payload(payload, "whsec_platform_fake")
        resp = await client.post("/webhooks/stripe/platform", content=body, headers={"stripe-signature": signature})
        assert resp.status_code == 200

        paid = (await client.get(f"/portal/invoices/{invoice_id}", headers=headers)).json()
        assert paid["status"] == "paid"
        assert paid["payments"][0]["method"] == "stripe"

    async def test_async_payment_is_recorded_only_once_it_settles(
        self, client, db_session, email_outbox, portal_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = portal_setup
        contact_user = await self._connected(client, db_session, email_outbox, s, "pay-async@northwind.example")
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_test_fake")
        invoice_id = str(s["invoice"].id)
        headers = auth_headers(contact_user)
        common = {
            "invoice_id": invoice_id,
            "agency_id": str(s["agency"].id),
            "paid_by": str(contact_user.id),
            "amount": s["invoice"].total_cents - s["invoice"].amount_paid_cents,
        }

        pending_event = _checkout_event("evt_async_1", "checkout.session.completed", payment_status="unpaid", **common)
        body, signature = sign_stripe_payload(pending_event, "whsec_test_fake")
        await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        pending = (await client.get(f"/portal/invoices/{invoice_id}", headers=headers)).json()
        assert pending["payments"] == []

        settled_event = _checkout_event("evt_async_2", "checkout.session.async_payment_succeeded", **common)
        body, signature = sign_stripe_payload(settled_event, "whsec_test_fake")
        await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        settled = (await client.get(f"/portal/invoices/{invoice_id}", headers=headers)).json()
        assert settled["status"] == "paid"
        assert len(settled["payments"]) == 1


class TestPortalMessages:
    async def test_client_linked_thread_is_visible_and_repliable(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey4@northwind.example"
        )

        # Staff start a client-linked thread AFTER the contact exists — they
        # don't list the contact (not an agency member); the client link
        # auto-adds them.
        convo = await create_conversation(
            db_session,
            s["agency"],
            creator=s["owner"],
            kind="group",
            title="Rebrand chat",
            participant_user_ids=[],
            client_id=s["client"].id,
            project_id=None,
            initial_message="Kicking things off.",
        )

        listing = (await client.get("/portal/conversations", headers=auth_headers(contact_user))).json()
        assert [c["id"] for c in listing] == [str(convo.id)]

        reply = await client.post(
            f"/portal/conversations/{convo.id}/messages",
            data={"body": "Thanks — excited!"},
            headers=auth_headers(contact_user),
        )
        assert reply.status_code == 201, reply.text
        assert reply.json()["sender_kind"] == "client"

        # A thread linked to a DIFFERENT client is invisible here.
        other_client = await make_client(db_session, agency=s["agency"], name="Globex")
        other_contact = await make_user(db_session, email="pat@globex.example")
        from binx_api.modules.client_portal import service as portal_service

        _i, tok = await portal_service.create_client_invitation(
            db_session, s["agency"], other_client, email=other_contact.email, invited_by=s["owner"]
        )
        await portal_service.accept_client_invitation(db_session, tok, accepting_user=other_contact)
        other_convo = await create_conversation(
            db_session,
            s["agency"],
            creator=s["owner"],
            kind="group",
            title="Globex only",
            participant_user_ids=[],
            client_id=other_client.id,
            project_id=None,
            initial_message=None,
        )
        hidden = await client.get(f"/portal/conversations/{other_convo.id}", headers=auth_headers(contact_user))
        assert hidden.status_code == 404

    async def test_contact_sees_participant_avatars(
        self, client, db_session, email_outbox, portal_setup, tmp_path, monkeypatch
    ) -> None:
        monkeypatch.setattr(users_service.settings, "agency_upload_dir", str(tmp_path))
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey5@northwind.example"
        )
        convo = await create_conversation(
            db_session,
            s["agency"],
            creator=s["owner"],
            kind="group",
            title="Rebrand chat",
            participant_user_ids=[],
            client_id=s["client"].id,
            project_id=None,
            initial_message="Hi!",
        )
        headers = auth_headers(contact_user)
        avatar_url = f"/portal/conversations/{convo.id}/participants/{s['owner'].id}/avatar"

        detail = (await client.get(f"/portal/conversations/{convo.id}", headers=headers)).json()
        owner_row = next(p for p in detail["participants"] if p["user_id"] == str(s["owner"].id))
        assert owner_row["has_avatar"] is False
        assert (await client.get(avatar_url, headers=headers)).status_code == 404

        await client.put("/users/me/avatar", files={"file": PNG}, headers=auth_headers(s["owner"]))

        detail = (await client.get(f"/portal/conversations/{convo.id}", headers=headers)).json()
        owner_row = next(p for p in detail["participants"] if p["user_id"] == str(s["owner"].id))
        assert owner_row["has_avatar"] is True
        assert owner_row["avatar_version"]
        avatar = await client.get(avatar_url, headers=headers)
        assert avatar.status_code == 200
        assert avatar.headers["content-type"] == "image/png"

        # Someone with a photo who is NOT in the conversation can't be fetched.
        outsider = await make_user(db_session, email="outsider@example.com")
        await client.put("/users/me/avatar", files={"file": PNG}, headers=auth_headers(outsider))
        blocked = await client.get(
            f"/portal/conversations/{convo.id}/participants/{outsider.id}/avatar", headers=headers
        )
        assert blocked.status_code == 404


async def _create_and_send_proposal(client, agency_id, client_id, owner, *, title="Brand refresh") -> dict:
    create = await client.post(
        f"/agencies/{agency_id}/proposals",
        json={
            "client_id": str(client_id),
            "title": title,
            "recipient_email": "casey@northwind.example",
            "currency": "USD",
            "tax_rate_percent": "0",
            "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 500000}],
        },
        headers=auth_headers(owner),
    )
    assert create.status_code == 201, create.text
    proposal = create.json()

    send = await client.post(
        f"/agencies/{agency_id}/proposals/{proposal['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert send.status_code == 200, send.text
    return send.json()


class TestPortalProposals:
    async def test_list_and_read_are_scoped_and_exclude_drafts(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey5@northwind.example"
        )
        sent = await _create_and_send_proposal(client, s["agency"].id, s["client"].id, s["owner"])

        # A draft (never sent) must not appear.
        draft = await client.post(
            f"/agencies/{s['agency'].id}/proposals",
            json={
                "client_id": str(s["client"].id),
                "title": "Still drafting",
                "currency": "USD",
                "tax_rate_percent": "0",
                "line_items": [],
            },
            headers=auth_headers(s["owner"]),
        )
        assert draft.status_code == 201, draft.text

        # A proposal for a different client must not appear either.
        other_client = await make_client(db_session, agency=s["agency"], name="Globex")
        await _create_and_send_proposal(client, s["agency"].id, other_client.id, s["owner"], title="Globex proposal")

        listing = (await client.get("/portal/proposals", headers=auth_headers(contact_user))).json()
        assert [p["title"] for p in listing] == ["Brand refresh"]
        assert listing[0]["client_id"] == str(s["client"].id)

        detail = await client.get(f"/portal/proposals/{sent['id']}", headers=auth_headers(contact_user))
        assert detail.status_code == 200, detail.text
        assert detail.json()["line_items"][0]["description"] == "Brand strategy"

        hidden = await client.get(f"/portal/proposals/{draft.json()['id']}", headers=auth_headers(contact_user))
        assert hidden.status_code == 404

    async def test_sign_uses_the_signed_in_contacts_own_identity(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey6@northwind.example"
        )
        sent = await _create_and_send_proposal(client, s["agency"].id, s["client"].id, s["owner"])

        signed = await client.post(f"/portal/proposals/{sent['id']}/sign", headers=auth_headers(contact_user))
        assert signed.status_code == 200, signed.text
        body = signed.json()
        assert body["status"] == "signed"
        assert body["signature"]["signer_name"] == contact_user.full_name
        assert body["signature"]["signer_email"] == contact_user.email

    async def test_decline_with_a_reason(self, client, db_session, email_outbox, portal_setup) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey7@northwind.example"
        )
        sent = await _create_and_send_proposal(client, s["agency"].id, s["client"].id, s["owner"])

        declined = await client.post(
            f"/portal/proposals/{sent['id']}/decline",
            json={"reason": "Going with another agency"},
            headers=auth_headers(contact_user),
        )
        assert declined.status_code == 200, declined.text
        assert declined.json()["status"] == "declined"
        assert declined.json()["decline_reason"] == "Going with another agency"


class TestPortalContactCannotBecomeStaff:
    # A client-portal contact must never be able to acquire staff access —
    # see agencies/service.py::_check_not_a_portal_contact. This is the real,
    # server-enforced guard; onboarding/layout.tsx's redirect is just the UX
    # nicety that keeps them from seeing the form in the first place.
    async def test_an_accepted_client_contact_cannot_create_an_agency(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        contact_user, _ctx = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey3@northwind.example"
        )

        response = await client.post("/agencies", json={"name": "Sneaky Agency"}, headers=auth_headers(contact_user))
        assert response.status_code == 403


class TestPortalTeam:
    async def test_lists_only_people_on_the_clients_projects(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        from binx_api.modules.projects.models import ProjectMember
        from tests.factories import add_agency_member

        s = portal_setup
        dev = await make_user(db_session, full_name="Devon Dev", email="devon@agency.example")
        await add_agency_member(db_session, agency=s["agency"], user=dev)
        second = await make_project(
            db_session, agency=s["agency"], created_by=s["owner"], client=s["client"], name="Website"
        )
        db_session.add(ProjectMember(project_id=second.id, user_id=dev.id))

        # Someone who only works on another client's project must not appear.
        other_client = await make_client(db_session, agency=s["agency"], name="Globex")
        outsider = await make_user(db_session, full_name="Uma Unrelated", email="uma@agency.example")
        await add_agency_member(db_session, agency=s["agency"], user=outsider)
        secret = await make_project(
            db_session, agency=s["agency"], created_by=outsider, client=other_client, name="Secret"
        )
        await db_session.commit()
        assert secret.id

        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey-team@northwind.example"
        )

        resp = await client.get("/portal/team", headers=auth_headers(contact_user))
        assert resp.status_code == 200, resp.text
        team = resp.json()

        # One entry per person, alphabetical, with every project they're on.
        assert [m["full_name"] for m in team] == ["Devon Dev", "Olivia Owner"]
        assert [p["name"] for p in team[0]["projects"]] == ["Website"]
        assert [p["name"] for p in team[1]["projects"]] == ["Rebrand", "Website"]
        assert team[1]["email"] == "olivia@agency.example"
        # Phone sharing is opt-in.
        assert team[1]["phone"] is None

    async def test_contact_details_follow_the_members_privacy_settings(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        s = portal_setup
        owner_headers = auth_headers(s["owner"])
        s["owner"].phone_number = "+1 555 0100"
        await db_session.commit()
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey-priv@northwind.example"
        )
        headers = auth_headers(contact_user)

        privacy = {
            "profile_visibility": "team",
            "show_email_to_team": False,
            "show_phone_to_team": True,
            "activity_status_visible": True,
            "analytics_opt_out": False,
        }
        saved = await client.put("/users/me/privacy-settings", json=privacy, headers=owner_headers)
        assert saved.status_code == 200, saved.text

        owner_row = (await client.get("/portal/team", headers=headers)).json()[0]
        assert owner_row["email"] is None
        assert owner_row["phone"] == "+1 555 0100"

        await client.put(
            "/users/me/privacy-settings", json={**privacy, "profile_visibility": "private"}, headers=owner_headers
        )
        owner_row = (await client.get("/portal/team", headers=headers)).json()[0]
        assert owner_row["phone"] is None

    async def test_avatars_are_limited_to_the_clients_team(
        self, client, db_session, email_outbox, portal_setup
    ) -> None:
        from tests.factories import add_agency_member

        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey-pic@northwind.example"
        )
        headers = auth_headers(contact_user)
        avatar_url = f"/portal/team/{s['owner'].id}/avatar"

        assert (await client.get("/portal/team", headers=headers)).json()[0]["has_avatar"] is False
        assert (await client.get(avatar_url, headers=headers)).status_code == 404

        await client.put("/users/me/avatar", files={"file": PNG}, headers=auth_headers(s["owner"]))
        owner_row = (await client.get("/portal/team", headers=headers)).json()[0]
        assert owner_row["has_avatar"] is True
        assert owner_row["avatar_version"]
        avatar = await client.get(avatar_url, headers=headers)
        assert avatar.status_code == 200
        assert avatar.headers["content-type"] == "image/png"

        # A teammate at the agency who isn't on any of this client's projects.
        outsider = await make_user(db_session, email="no-project@agency.example")
        await add_agency_member(db_session, agency=s["agency"], user=outsider)
        await client.put("/users/me/avatar", files={"file": PNG}, headers=auth_headers(outsider))
        assert (await client.get(f"/portal/team/{outsider.id}/avatar", headers=headers)).status_code == 404

    async def test_a_non_contact_account_is_forbidden(self, client, db_session, portal_setup) -> None:
        stranger = await make_user(db_session, email="team-stranger@example.com")
        assert (await client.get("/portal/team", headers=auth_headers(stranger))).status_code == 403
