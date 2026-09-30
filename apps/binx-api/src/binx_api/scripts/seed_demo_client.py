"""
Fill an existing client's portal with a realistic, fully-populated dataset for
manual testing: projects in every state with task boards and canvases, a
pending kickoff (so the portal's invitation modal fires), proposals awaiting
signature / signed / expired, invoices unpaid / overdue / part-paid / paid,
upcoming and past meetings, and a conversation with the team.

Unlike ``seed_e2e`` it never creates agencies or users — it looks up an
existing agency + client (which must already have a portal contact) and adds
to them. Re-runnable: rows it created on a previous run (matched by the fixed
titles below) are removed first; everything else on the client is untouched.

    uv run binx-api-seed-demo-client                      # John Doe @ Foundry Frame LLC
    uv run binx-api-seed-demo-client --agency "Acme" --client "Globex"

Emails are forced to the log (never SES), whatever ``.env`` says.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select

logger = logging.getLogger("binx_api.seed_demo_client")

DEFAULT_AGENCY = "Foundry Frame LLC"
DEFAULT_CLIENT = "John Doe"

# Every row this script creates is keyed by one of these titles, so a re-run
# can find and replace its own data without touching anything real.
PROJECT_WEBSITE = "Website Redesign"
PROJECT_BRAND = "Brand Identity Refresh"
PROJECT_APP = "Customer Mobile App"
PROJECT_LAUNCH = "Spring Launch Campaign"
SEED_PROJECTS = [PROJECT_WEBSITE, PROJECT_BRAND, PROJECT_APP, PROJECT_LAUNCH]

PROPOSAL_PENDING = "Mobile App — Phase 1 Build"
PROPOSAL_SIGNED = "Website Redesign — Scope of Work"
PROPOSAL_EXPIRED = "Ongoing SEO Retainer"
SEED_PROPOSALS = [PROPOSAL_PENDING, PROPOSAL_SIGNED, PROPOSAL_EXPIRED]

SEED_CONVERSATIONS = ["Website Redesign — feedback", "General"]

SEED_MEETINGS = [
    "Homepage design review",
    "Mobile app discovery workshop",
    "Monthly check-in",
    "Project kickoff call",
    "Brand concepts presentation",
]

# Invoices have no title; their notes carry the marker instead.
INVOICE_MARKER = "Demo data"

# --- Content ----------------------------------------------------------------

_WEBSITE_TASKS = [
    # (title, column: 0 To do / 1 In progress / 2 Done, due in N days or None)
    ("Stakeholder interviews", 2, None),
    ("Sitemap & information architecture", 2, None),
    ("Homepage wireframes", 2, None),
    ("Homepage visual design", 1, 3),
    ("Services page design", 1, 6),
    ("Case study template", 0, 10),
    ("Blog & article layout", 0, 14),
    ("Contact form + CRM integration", 0, 18),
    ("Content migration", 0, 24),
    ("Accessibility audit", 0, 28),
    ("Launch checklist & QA", 0, 32),
]

_BRAND_TASKS = [
    ("Brand workshop", 2, None),
    ("Logo concepts", 2, None),
    ("Colour & typography system", 2, None),
    ("Brand guidelines PDF", 2, None),
    ("Social media templates", 2, None),
]

_APP_TASKS = [
    ("Discovery workshop", 0, 7),
    ("User journeys", 0, 12),
    ("Technical architecture", 0, 15),
]

_LAUNCH_TASKS = [
    ("Campaign concept", 2, None),
    ("Landing page", 1, 4),
    ("Email sequence (3 emails)", 1, 5),
    ("Paid social creative", 0, 9),
    ("Launch-day runbook", 0, 11),
]

_CANVAS_NOTES = [
    (60, 60, "Moodboard: warm, confident, lots of whitespace", "#fef3c7"),
    (330, 60, "Hero headline needs to say what we do in under 8 words", "#e0f2fe"),
    (60, 270, "Photography: real team + real customers, no stock", "#f3e8ff"),
    (330, 270, "Primary CTA: 'Get a quote' — keep it above the fold", "#dcfce7"),
    (600, 150, "Launch target: end of next month", "#fee2e2"),
]

_KICKOFF_QUESTIONS = [
    ("text", "In a sentence or two, what should the app help your customers do?", [], True),
    ("multiple_choice", "Which platforms do you need at launch?", ["iOS", "Android", "Both"], True),
    ("text", "Who are your main competitors, and what do you like or dislike about their apps?", [], True),
    ("multiple_choice", "Do customers need to log in?", ["Yes", "No", "Not sure yet"], True),
    ("file_upload", "Upload any existing brand assets or sketches (optional)", [], False),
    ("text", "Anything else we should know before we start?", [], False),
]


async def _run(agency_name: str, client_name: str) -> None:
    # Imported lazily so ``get_settings()`` / the engine bind after the process
    # environment (``.env``) is fully loaded.
    from binx_api.core import email as email_module
    from binx_api.core.database import async_session_factory
    from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
    from binx_api.modules.boards.service import add_comment, create_item, get_or_create_board
    from binx_api.modules.client_portal.models import ClientContact
    from binx_api.modules.invoicing.models import Invoice
    from binx_api.modules.invoicing.schemas import LineItemInput
    from binx_api.modules.invoicing.service import add_payment, create_invoice, issue_invoice
    from binx_api.modules.kickoffs.schemas import KickoffQuestionInput
    from binx_api.modules.kickoffs.service import create_kickoff, send_kickoff
    from binx_api.modules.meetings.models import CREATED_BY_AGENCY_MEMBER, CREATED_BY_CLIENT, Meeting
    from binx_api.modules.messaging.models import Conversation
    from binx_api.modules.messaging.service import create_conversation, post_message
    from binx_api.modules.projects import service as projects_service
    from binx_api.modules.projects.models import Project
    from binx_api.modules.proposals.models import Proposal
    from binx_api.modules.proposals.schemas import ProposalLineItemInput
    from binx_api.modules.proposals.service import create_proposal, record_view, send_proposal, sign_proposal
    from binx_api.modules.users.models import User

    # Never email anyone from a seed, even when .env points at real SES.
    email_module.settings.ses_from_email = None

    # This is dev data on top of a real agency — don't let its plan's
    # active-project cap stop the seed (it only guards the create path).
    async def _no_project_limit(*_args, **_kwargs) -> None:
        return None

    projects_service._check_can_create_project = _no_project_limit

    now = datetime.now(UTC)
    today = now.date()

    def days(n: int) -> date:
        return today + timedelta(days=n)

    def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
        return (now + timedelta(days=day_offset)).replace(hour=hour, minute=minute, second=0, microsecond=0)

    async with async_session_factory() as db:
        # --- Resolve the agency, client, staff and portal contact ----------
        agency = (await db.execute(select(Agency).where(Agency.name == agency_name))).scalars().first()
        if agency is None:
            raise SystemExit(f"No agency named {agency_name!r}")
        client = (
            (
                await db.execute(
                    select(AgencyClient).where(AgencyClient.agency_id == agency.id, AgencyClient.name == client_name)
                )
            )
            .scalars()
            .first()
        )
        if client is None:
            raise SystemExit(f"No client named {client_name!r} in {agency_name!r}")

        contact_row = (
            await db.execute(
                select(ClientContact, User)
                .join(User, User.id == ClientContact.user_id)
                .where(ClientContact.client_id == client.id)
                .order_by(ClientContact.is_primary.desc())
            )
        ).first()
        if contact_row is None:
            raise SystemExit(f"{client_name!r} has no portal contact yet — invite one from the client page first")
        contact: User = contact_row[1]

        members = (
            await db.execute(
                select(AgencyMember, User)
                .join(User, User.id == AgencyMember.user_id)
                .where(AgencyMember.agency_id == agency.id)
            )
        ).all()
        role_rank = {"owner": 0, "admin": 1}
        members.sort(key=lambda row: role_rank.get(row[0].role, 2))
        staff: list[User] = [row[1] for row in members]
        owner = staff[0]
        teammate = staff[1] if len(staff) > 1 else owner
        designer = staff[2] if len(staff) > 2 else teammate

        # --- Remove this script's previous run -----------------------------
        old_projects = (
            (
                await db.execute(
                    select(Project.id).where(Project.client_id == client.id, Project.name.in_(SEED_PROJECTS))
                )
            )
            .scalars()
            .all()
        )
        await db.execute(
            delete(Invoice).where(Invoice.client_id == client.id, Invoice.notes.like(f"{INVOICE_MARKER}%"))
        )
        await db.execute(delete(Meeting).where(Meeting.client_id == client.id, Meeting.title.in_(SEED_MEETINGS)))
        await db.execute(delete(Proposal).where(Proposal.client_id == client.id, Proposal.title.in_(SEED_PROPOSALS)))
        await db.execute(
            delete(Conversation).where(Conversation.client_id == client.id, Conversation.title.in_(SEED_CONVERSATIONS))
        )
        if old_projects:
            await db.execute(delete(Project).where(Project.id.in_(old_projects)))  # cascades tasks, boards, kickoffs
        await db.commit()

        # --- Projects + task boards ----------------------------------------
        async def make_project(name, description, status_, start, due, tasks):
            project = await projects_service.create_project(
                db,
                agency,
                created_by=owner,
                client_id=client.id,
                name=name,
                description=description,
                status_=status_,
                start_date=start,
                due_date=due,
            )
            for member in {teammate.id, designer.id} - {owner.id}:  # the creator is already a member
                await projects_service.add_project_member(db, project, user_id=member)
            columns = [task_list for task_list, _ in await projects_service.get_project_board(db, project.id)]
            assignees = [owner, teammate, designer]
            for i, (title, col_index, due_in) in enumerate(tasks):
                task = await projects_service.create_task(
                    db,
                    project,
                    list_id=columns[0].id,
                    title=title,
                    description=None,
                    due_date=days(due_in) if due_in is not None else None,
                    assignee_id=assignees[i % len(assignees)].id,
                )
                if col_index != 0:
                    await projects_service.move_task(db, task, list_id=columns[col_index].id, position=0)
            return project

        website = await make_project(
            PROJECT_WEBSITE,
            "A faster, clearer marketing site: new homepage, services and case studies, built to convert.",
            "active",
            days(-30),
            days(35),
            _WEBSITE_TASKS,
        )
        launch = await make_project(
            PROJECT_LAUNCH,
            "Landing page, email sequence and paid social for the spring product launch.",
            "active",
            days(-10),
            days(21),
            _LAUNCH_TASKS,
        )
        app = await make_project(
            PROJECT_APP,
            "An iOS + Android app for booking, order tracking and loyalty rewards.",
            "planning",
            days(14),
            days(120),
            _APP_TASKS,
        )
        brand = await make_project(
            PROJECT_BRAND,
            "New logo, colour palette, typography and brand guidelines.",
            "completed",
            days(-120),
            days(-45),
            _BRAND_TASKS,
        )

        # --- Canvas (with client + agency activity) -------------------------
        board = await get_or_create_board(db, website)
        notes = []
        for x, y, text, color in _CANVAS_NOTES:
            notes.append(
                await create_item(
                    db,
                    board,
                    website,
                    actor=designer,
                    type_="note",
                    x=float(x),
                    y=float(y),
                    width=240.0,
                    height=170.0,
                    content={"text": text},
                    color=color,
                )
            )
        await create_item(
            db,
            board,
            website,
            actor=contact,
            author_kind="client",
            type_="note",
            x=870.0,
            y=150.0,
            width=240.0,
            height=170.0,
            content={"text": "Can we try the darker navy for the header? Love the rest."},
            color="#fde68a",
        )
        await add_comment(
            db, notes[1], website, author=contact, author_kind="client", body="Agreed — shorter is better."
        )
        await add_comment(
            db,
            notes[1],
            website,
            author=designer,
            author_kind="agency",
            body="We'll bring three options to the design review.",
        )

        # --- Pending kickoff (drives the portal's invitation modal) --------
        kickoff = await create_kickoff(
            db,
            app,
            created_by=owner,
            title="Mobile app kickoff",
            intro_message=(
                "Before our discovery workshop we'd love a little context from you — "
                "it takes about five minutes and helps us hit the ground running."
            ),
            template_id=None,
            questions=[
                KickoffQuestionInput(type=kind, label=label, options=options, required=required)
                for kind, label, options, required in _KICKOFF_QUESTIONS
            ],
        )
        await send_kickoff(db, kickoff, sent_by=owner)

        # --- Proposals -------------------------------------------------------
        async def make_proposal(title, content, valid_until, items):
            return await create_proposal(
                db,
                agency,
                created_by=owner,
                lead_id=None,
                client_id=client.id,
                title=title,
                recipient_name=contact.full_name,
                recipient_email=contact.email,
                content=content,
                currency="USD",
                tax_rate_percent=Decimal("0"),
                valid_until=valid_until,
                line_items=[
                    ProposalLineItemInput(description=d, quantity=Decimal(q), unit_price_cents=p) for d, q, p in items
                ],
            )

        signed = await make_proposal(
            PROPOSAL_SIGNED,
            "## Overview\nA full redesign of your marketing site across five core templates.\n\n"
            "## Deliverables\n- Wireframes and visual design\n- Responsive build\n"
            "- Content migration\n- Launch support",
            now + timedelta(days=30),
            [
                ("Discovery & information architecture", "1", 350_000),
                ("Visual design — 5 templates", "1", 600_000),
                ("Front-end build", "40", 12_500),
            ],
        )
        await send_proposal(db, signed, sent_by=owner, recipient_email=None)
        await record_view(db, signed)
        await sign_proposal(
            db, signed, signer_name=contact.full_name, signer_email=contact.email, ip_address="127.0.0.1"
        )

        pending = await make_proposal(
            PROPOSAL_PENDING,
            "## Overview\nPhase 1 of your customer app: booking, order tracking and account management "
            "on iOS and Android.\n\n## Timeline\nAbout 12 weeks from kickoff to App Store submission.",
            now + timedelta(days=14),
            [
                ("Product discovery & UX", "1", 800_000),
                ("UI design", "1", 900_000),
                ("iOS + Android build (React Native)", "160", 14_000),
                ("QA & App Store submission", "1", 250_000),
            ],
        )
        await send_proposal(db, pending, sent_by=owner, recipient_email=None)

        expired = await make_proposal(
            PROPOSAL_EXPIRED,
            "Monthly SEO audits, content recommendations and reporting.",
            now + timedelta(days=30),
            [("SEO retainer (monthly)", "3", 120_000)],
        )
        await send_proposal(db, expired, sent_by=owner, recipient_email=None)
        await record_view(db, expired)
        expired.valid_until = now - timedelta(days=5)  # lapsed without a signature
        await db.commit()

        # --- Invoices ------------------------------------------------------
        async def make_invoice(project, issue, due, note, items):
            invoice = await create_invoice(
                db,
                agency,
                created_by=owner,
                client_id=client.id,
                project_id=project.id if project else None,
                issue_date=issue,
                due_date=due,
                discount_amount_cents=None,
                discount_percent=None,
                tax_rate_percent=Decimal("0"),
                notes=f"{INVOICE_MARKER} — {note}",
                payment_instructions="Pay online by card, or bank transfer to Foundry Frame LLC.",
                line_items=[LineItemInput(description=d, quantity=Decimal(q), unit_price_cents=p) for d, q, p in items],
            )
            await issue_invoice(db, invoice, issued_by=owner)
            return invoice

        paid = await make_invoice(
            brand,
            days(-75),
            days(-61),
            "Brand identity, final payment. Thank you!",
            [("Brand identity — concepts & guidelines", "1", 650_000)],
        )
        await add_payment(
            db, paid, recorded_by=owner, amount_cents=paid.total_cents, paid_on=days(-63), method="card", reference=None
        )

        deposit = await make_invoice(
            website,
            days(-28),
            days(-14),
            "Website redesign, 50% deposit.",
            [("Website redesign — 50% deposit", "1", 540_000)],
        )
        await add_payment(
            db,
            deposit,
            recorded_by=owner,
            amount_cents=deposit.total_cents,
            paid_on=days(-20),
            method="bank_transfer",
            reference="ACH 20931",
        )

        await make_invoice(
            launch,
            days(-25),
            days(-4),
            "Launch campaign, concept & strategy.",
            [("Campaign concept & strategy", "1", 180_000), ("Copywriting", "6", 9_500)],
        )  # overdue

        partial = await make_invoice(
            website,
            days(-6),
            days(12),
            "Website redesign, design milestone.",
            [("Visual design — 5 templates", "1", 300_000), ("Design revisions", "8", 12_500)],
        )
        await add_payment(
            db,
            partial,
            recorded_by=owner,
            amount_cents=150_000,
            paid_on=days(-2),
            method="bank_transfer",
            reference="ACH 21177",
        )

        await make_invoice(
            None,
            days(-1),
            days(13),
            "Monthly support retainer.",
            [("Website support & maintenance", "1", 95_000), ("Hosting", "1", 4_900)],
        )  # due, unpaid

        # --- Meetings --------------------------------------------------------
        meetings = [
            (
                "Homepage design review",
                website,
                2,
                15,
                "Walk through homepage + services designs.",
                CREATED_BY_AGENCY_MEMBER,
            ),
            (
                "Mobile app discovery workshop",
                app,
                9,
                14,
                "Goals, users and must-haves for Phase 1.",
                CREATED_BY_AGENCY_MEMBER,
            ),
            ("Monthly check-in", None, 16, 10, None, CREATED_BY_CLIENT),
            (
                "Project kickoff call",
                website,
                -29,
                11,
                "Intros, timeline and ways of working.",
                CREATED_BY_AGENCY_MEMBER,
            ),
            ("Brand concepts presentation", brand, -100, 13, None, CREATED_BY_AGENCY_MEMBER),
        ]
        for title, project, day_offset, hour, notes_text, kind in meetings:
            creator = contact if kind == CREATED_BY_CLIENT else owner
            starts = at(day_offset, hour)
            db.add(
                Meeting(
                    agency_id=agency.id,
                    client_id=client.id,
                    project_id=project.id if project else None,
                    title=title,
                    notes=notes_text,
                    location="https://meet.google.com/abc-defg-hij",
                    starts_at=starts,
                    ends_at=starts + timedelta(minutes=45),
                    created_by_kind=kind,
                    created_by_user_id=creator.id,
                    created_by_name=creator.full_name,
                )
            )
        await db.commit()

        # --- Conversations ---------------------------------------------------
        feedback = await create_conversation(
            db,
            agency,
            creator=designer,
            kind="group",
            title=SEED_CONVERSATIONS[0],
            participant_user_ids=[owner.id],
            client_id=client.id,
            project_id=website.id,
            initial_message="Homepage designs are up on the canvas. Would love your first impressions!",
        )
        await post_message(
            db, feedback, sender=contact, body="These look great. Can we try the darker navy in the header?", uploads=[]
        )
        await post_message(
            db,
            feedback,
            sender=designer,
            body="Absolutely, we'll have a couple of variations ready for Thursday's review.",
            uploads=[],
        )

        await create_conversation(
            db,
            agency,
            creator=owner,
            kind="group",
            title=SEED_CONVERSATIONS[1],
            participant_user_ids=[teammate.id],
            client_id=client.id,
            project_id=None,
            initial_message=(
                f"Hi {contact.full_name.split()[0]}, quick heads-up: the mobile app proposal is in your portal "
                "and the kickoff questionnaire is ready whenever you are."
            ),
        )  # left unread for the client

    logger.info(
        "Seeded %r (%s) in %r: 4 projects, 3 proposals, 5 invoices, 5 meetings, 2 conversations, 1 pending kickoff",
        client_name,
        contact.email,
        agency_name,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill an existing client's portal with demo data.")
    parser.add_argument("--agency", default=DEFAULT_AGENCY, help=f"agency name (default: {DEFAULT_AGENCY!r})")
    parser.add_argument("--client", default=DEFAULT_CLIENT, help=f"client name (default: {DEFAULT_CLIENT!r})")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_run(args.agency, args.client))


if __name__ == "__main__":
    main()
