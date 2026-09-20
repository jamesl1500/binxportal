"""
Seed a fixed, known dataset for the binx-web Playwright E2E suite.

Idempotent: every run tears the demo agency and demo users down and rebuilds
them, so a test pass always starts from the same state. It talks to whatever
``DATABASE_URL`` resolves to (``.env`` in local dev), going through the real
service functions so the rows are wired exactly as the app would wire them —
the same rationale as ``tests/factories.py``.

    uv run binx-api-seed-e2e

The credentials and slugs it creates are consumed by
``apps/binx-web/e2e/fixtures.ts`` — keep the two in sync.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

logger = logging.getLogger("binx_api.seed_e2e")

# --- Fixed demo data -------------------------------------------------------
# Mirrored in apps/binx-web/e2e/fixtures.ts.

PASSWORD = "e2e-Passw0rd!"  # noqa: S105 - throwaway local/CI seed credential

# `.test` / `.example` TLDs are rejected by pydantic's EmailStr (email-validator
# treats them as special-use), so the demo accounts live on example.com — the
# same domain the pytest suite uses.
STAFF_EMAIL = "e2e-owner@northlight.example.com"
STAFF_USER_NAME = "e2e_owner"
STAFF_NAME = "Morgan Reyes"

CLIENT_EMAIL = "e2e-client@fjordandfield.example.com"
CLIENT_USER_NAME = "e2e_client"
CLIENT_CONTACT_NAME = "Priya Nair"

TEAMMATE_EMAIL = "e2e-teammate@northlight.example.com"
TEAMMATE_USER_NAME = "e2e_teammate"
TEAMMATE_NAME = "Sam Okafor"

AGENCY_NAME = "Northlight Studio"
CLIENT_NAME = "Fjord & Field"
PROJECT_NAME = "Brand & Website Refresh"

DEMO_EMAILS = [STAFF_EMAIL, CLIENT_EMAIL, TEAMMATE_EMAIL]
DEMO_USER_NAMES = [STAFF_USER_NAME, CLIENT_USER_NAME, TEAMMATE_USER_NAME]

# Every PageCoachmark id in binx-web (grep `<PageCoachmark`). The welcome tour and
# these popups open a modal over the app on first visit, which would intercept
# every click in the suite — so the staff demo users start with all of it seen.
_TUTORIAL_POPUP_IDS = [
    "clients-new",
    "dashboard-my-work",
    "invoices-new",
    "leads-new",
    "messages-new",
    "projects-new",
    "team-invitations",
]

_BOARD_NOTES = [
    (60, 60, "Moodboard: coastal, warm neutrals, lots of air", "#fef3c7"),
    (320, 60, "Logo needs to work at 16px favicon size", "#e0f2fe"),
    (60, 260, "Homepage hero: product shot > illustration", "#f3e8ff"),
    (320, 260, "Client: 'make the CTA impossible to miss'", "#dcfce7"),
    (590, 130, "Launch target: end of Q3", "#fee2e2"),
    (590, 340, "Photography reshoot booked for the 14th", "#e2e8f0"),
]


async def _run() -> None:
    # Imported lazily so ``get_settings()`` / the engine bind after the process
    # environment (``.env``) is fully loaded.
    from binx_api.core.database import async_session_factory
    from binx_api.modules.agencies.models import Agency, AgencyMember
    from binx_api.modules.agencies.service import create_agency_with_owner, create_client
    from binx_api.modules.boards.service import create_item, get_or_create_board
    from binx_api.modules.client_portal.models import ClientContact
    from binx_api.modules.invoicing.schemas import LineItemInput
    from binx_api.modules.invoicing.service import create_invoice, issue_invoice
    from binx_api.modules.messaging.service import create_conversation, post_message
    from binx_api.modules.projects.service import create_project, create_task, get_project_board, move_task
    from binx_api.modules.users.models import User
    from binx_api.modules.users.service import create_user, update_tutorial_progress

    async def verified_user(user_name: str, email: str, full_name: str):
        account = await create_user(db, user_name=user_name, email=email, full_name=full_name, password=PASSWORD)
        account.is_verified = True
        account.is_active = True
        await db.commit()
        await db.refresh(account)
        return account

    async with async_session_factory() as db:
        # --- Wipe any previous run ---------------------------------------
        agencies = (await db.execute(select(Agency).where(Agency.name == AGENCY_NAME))).scalars().all()
        for agency in agencies:
            await db.delete(agency)  # cascades to members, clients, projects, invoices, boards, conversations
        stale_users = (
            (await db.execute(select(User).where(User.email.in_(DEMO_EMAILS) | User.user_name.in_(DEMO_USER_NAMES))))
            .scalars()
            .all()
        )
        for stale in stale_users:
            await db.delete(stale)
        await db.commit()

        # --- Users -----------------------------------------------------------
        owner = await verified_user(STAFF_USER_NAME, STAFF_EMAIL, STAFF_NAME)
        teammate = await verified_user(TEAMMATE_USER_NAME, TEAMMATE_EMAIL, TEAMMATE_NAME)
        client_contact_user = await verified_user(CLIENT_USER_NAME, CLIENT_EMAIL, CLIENT_CONTACT_NAME)
        for staff_user in (owner, teammate):
            await update_tutorial_progress(
                db, staff_user, tour_completed=True, dismissed_popups=list(_TUTORIAL_POPUP_IDS)
            )

        # --- Agency + team --------------------------------------------------
        agency = await create_agency_with_owner(db, owner=owner, name=AGENCY_NAME)

        db.add(AgencyMember(agency_id=agency.id, user_id=teammate.id, role="member"))
        await db.commit()

        # --- Client + portal contact --------------------------------------
        client = await create_client(
            db,
            agency,
            name=CLIENT_NAME,
            primary_contact_name=CLIENT_CONTACT_NAME,
            primary_contact_email=CLIENT_EMAIL,
            primary_contact_phone="+1 555 0142",
            website="https://fjordandfield.example.com",
            notes="Sustainable outdoor apparel. Founder-led, quick to give feedback.",
            billing_email="ap@fjordandfield.example.com",
            billing_address="24 Harbour Road\nPortland, ME 04101",
        )
        second_client = await create_client(
            db,
            agency,
            name="Kestrel Coffee",
            primary_contact_name="Dana Lowe",
            primary_contact_email="dana@kestrel.example.com",
            primary_contact_phone=None,
            website="https://kestrel.example.com",
            notes=None,
        )
        db.add(ClientContact(agency_id=agency.id, client_id=client.id, user_id=client_contact_user.id, is_primary=True))
        await db.commit()

        # --- Project + board of tasks -----------------------------------
        project = await create_project(
            db,
            agency,
            created_by=owner,
            client_id=client.id,
            name=PROJECT_NAME,
            description="Full rebrand and a new marketing site on the portal-linked stack.",
            status_="active",
            start_date=None,
            due_date=(datetime.now(UTC) + timedelta(days=45)).date(),
        )
        await create_project(
            db,
            agency,
            created_by=owner,
            client_id=second_client.id,
            name="Packaging system",
            description=None,
            status_="planning",
            start_date=None,
            due_date=None,
        )

        board_lists = await get_project_board(db, project.id)
        columns = [task_list for task_list, _ in board_lists]  # To Do / In Progress / Done (seeded order)
        task_titles = [
            "Kick-off workshop notes",
            "Competitive audit",
            "Brand territory concepts",
            "Logo refinement",
            "Colour + type system",
            "Homepage wireframe",
            "Homepage visual design",
            "About + Contact pages",
            "Component library in code",
            "Content migration",
            "Accessibility pass",
            "Launch checklist",
        ]
        # Column index per task: 2 = Done, 1 = In progress, 0 = To do.
        layout = [2, 2, 1, 1] + [0] * (len(task_titles) - 4)
        for title, col_index in zip(task_titles, layout, strict=True):
            task = await create_task(
                db,
                project,
                list_id=columns[0].id,
                title=title,
                description=None,
                due_date=None,
                assignee_id=(owner.id if col_index != 0 else None),
            )
            if col_index != 0:
                await move_task(db, task, list_id=columns[col_index].id, position=0)

        # --- Collaboration canvas -------------------------------------------
        board = await get_or_create_board(db, project)
        for x, y, text, color in _BOARD_NOTES:
            await create_item(
                db,
                board,
                project,
                actor=owner,
                type_="note",
                x=float(x),
                y=float(y),
                width=240.0,
                height=170.0,
                content={"text": text},
                color=color,
            )
        await create_item(
            db,
            board,
            project,
            actor=client_contact_user,
            author_kind="client",
            type_="note",
            x=850.0,
            y=210.0,
            width=240.0,
            height=170.0,
            content={"text": "Love concept 2 — can we see it on the About page too?"},
            color="#fde68a",
        )

        # --- Invoice (issued) --------------------------------------------
        invoice = await create_invoice(
            db,
            agency,
            created_by=owner,
            client_id=client.id,
            project_id=project.id,
            issue_date=None,
            due_date=None,
            discount_amount_cents=None,
            discount_percent=None,
            tax_rate_percent=Decimal("0"),
            notes="Thanks for the partnership — payment details below.",
            payment_instructions="Bank transfer to Northlight Studio, sort 00-00-00, acct 1234 5678.",
            line_items=[
                LineItemInput(
                    description="Brand identity — discovery & concepts", quantity=Decimal("1"), unit_price_cents=280_000
                ),
                LineItemInput(
                    description="Website design (5 templates)", quantity=Decimal("1"), unit_price_cents=420_000
                ),
                LineItemInput(description="Front-end build", quantity=Decimal("18"), unit_price_cents=12_500),
            ],
        )
        await issue_invoice(db, invoice, issued_by=owner)
        await create_invoice(
            db,
            agency,
            created_by=owner,
            client_id=client.id,
            project_id=None,
            issue_date=None,
            due_date=None,
            discount_amount_cents=None,
            discount_percent=None,
            tax_rate_percent=Decimal("0"),
            notes=None,
            payment_instructions=None,
            line_items=[
                LineItemInput(description="Retainer — August", quantity=Decimal("1"), unit_price_cents=150_000)
            ],
        )

        # --- Conversations -------------------------------------------------
        team_thread = await create_conversation(
            db,
            agency,
            creator=owner,
            kind="group",
            title="Refresh — internal",
            participant_user_ids=[teammate.id],
            client_id=None,
            project_id=project.id,
            initial_message="Kicking this off — concepts due to the client Thursday.",
        )
        await post_message(
            db, team_thread, sender=teammate, body="On it. I'll start the competitive audit today.", uploads=[]
        )

        client_thread = await create_conversation(
            db,
            agency,
            creator=owner,
            kind="group",
            title="Fjord & Field ↔ Northlight",
            participant_user_ids=[],
            client_id=client.id,
            project_id=None,
            initial_message="Hi Priya — first round of brand concepts is in the canvas whenever you have a moment.",
        )
        await post_message(
            db,
            client_thread,
            sender=client_contact_user,
            body="Amazing, taking a look now. Concept 2 is really strong.",
            uploads=[],
        )

    logger.info("Seed complete: agency=%r staff=%s client=%s", AGENCY_NAME, STAFF_EMAIL, CLIENT_EMAIL)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_run())


if __name__ == "__main__":
    main()
