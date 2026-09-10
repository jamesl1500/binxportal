"""
End-to-end tests for the client portal: staff invite a contact, the contact
onboards with their own account, and the `/portal/*` surface is scoped to
that one client — projects, invoices (pay stub), and client-linked messages.
"""

from __future__ import annotations

import pytest

from binx_api.modules.invoicing.service import issue_invoice
from binx_api.modules.messaging.service import create_conversation
from tests.conftest import auth_headers, extract_token
from tests.factories import make_agency, make_client, make_invoice, make_project, make_user

pytestmark = pytest.mark.e2e


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
        for path in ("/portal/context", "/portal/projects", "/portal/invoices", "/portal/conversations"):
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

    async def test_pay_invoice_stub_marks_it_paid(self, client, db_session, email_outbox, portal_setup) -> None:
        s = portal_setup
        contact_user, _ = await _invite_and_accept(
            client, db_session, email_outbox, s["agency"].id, s["client"].id, s["owner"], "casey3@northwind.example"
        )

        paid = await client.post(f"/portal/invoices/{s['invoice'].id}/pay", headers=auth_headers(contact_user))
        assert paid.status_code == 200, paid.text
        body = paid.json()
        assert body["status"] == "paid"
        assert body["amount_due_cents"] == 0
        assert body["payments"][0]["method"] == "portal"

        # Paying an already-paid invoice is rejected.
        again = await client.post(f"/portal/invoices/{s['invoice'].id}/pay", headers=auth_headers(contact_user))
        assert again.status_code == 400


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
