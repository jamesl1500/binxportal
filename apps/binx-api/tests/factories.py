"""
Async factory helpers for building test data.

These deliberately go through the real service functions (``create_user``,
``create_agency_with_owner``, ``create_project`` ...) rather than inserting ORM
rows by hand, so the objects a test starts from are wired up exactly the way
the application would wire them (owner membership, seeded kanban columns,
generated slugs, ...). Every helper takes the test's ``db_session`` as its
first argument and commits through it.

Counters keep the unique columns (``user_name``, ``email``) collision-free
across a single test without every call site having to pass them.
"""

from __future__ import annotations

import itertools
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.agencies.service import create_agency_with_owner, create_client
from binx_api.modules.invoicing.models import Invoice
from binx_api.modules.invoicing.schemas import LineItemInput
from binx_api.modules.invoicing.service import create_invoice
from binx_api.modules.messaging.models import Conversation
from binx_api.modules.messaging.service import create_conversation, post_message
from binx_api.modules.projects.models import Project, ProjectTask, ProjectTaskList
from binx_api.modules.projects.service import create_project, create_task, get_project_board
from binx_api.modules.users.models import User
from binx_api.modules.users.service import create_user

_user_seq = itertools.count(1)
_client_seq = itertools.count(1)


async def make_user(
    db: AsyncSession,
    *,
    user_name: str | None = None,
    email: str | None = None,
    full_name: str = "Test User",
    password: str = "test-password-123",
    is_verified: bool = True,
    is_active: bool = True,
    role: str = "user",
) -> User:
    """Create a user. Verified and active by default — the state most tests want."""
    n = next(_user_seq)
    account = await create_user(
        db,
        user_name=user_name or f"user{n}",
        email=email or f"user{n}@example.com",
        full_name=full_name,
        password=password,
    )
    account.is_verified = is_verified
    account.is_active = is_active
    account.role = role
    await db.commit()
    await db.refresh(account)
    return account


async def make_agency(db: AsyncSession, *, owner: User, name: str = "Acme Agency") -> Agency:
    """Create an agency with ``owner`` as its ``owner``-role member."""
    return await create_agency_with_owner(db, owner=owner, name=name)


async def make_client(db: AsyncSession, *, agency: Agency, name: str | None = None) -> AgencyClient:
    """Create a client under ``agency``."""
    return await create_client(
        db,
        agency,
        name=name or f"Client {next(_client_seq)}",
        primary_contact_name=None,
        primary_contact_email=None,
        primary_contact_phone=None,
        website=None,
        notes=None,
    )


async def make_project(
    db: AsyncSession,
    *,
    agency: Agency,
    created_by: User,
    client: AgencyClient | None = None,
    name: str = "Website Redesign",
    status: str = "planning",
) -> Project:
    """Create a project (seeding a client first if one isn't supplied)."""
    if client is None:
        client = await make_client(db, agency=agency)
    return await create_project(
        db,
        agency,
        created_by=created_by,
        client_id=client.id,
        name=name,
        description=None,
        status_=status,
        start_date=None,
        due_date=None,
    )


async def add_agency_member(db: AsyncSession, *, agency: Agency, user: User, role: str = "member") -> AgencyMember:
    """Add ``user`` to ``agency`` directly. There's no plain "add member"
    service (joining goes through the invitation flow), so this inserts the
    membership row the accept step would have created."""
    member = AgencyMember(agency_id=agency.id, user_id=user.id, role=role)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def make_client_contact(
    db: AsyncSession, *, agency: Agency, client: AgencyClient, user: User, is_primary: bool = False
):
    """Grant ``user`` client-portal access to ``client``. Skips the
    invite/accept flow (see tests/e2e/test_client_portal_flow.py for that) and
    inserts the ClientContact row the accept step would have created."""
    from binx_api.modules.client_portal.models import ClientContact

    contact = ClientContact(agency_id=agency.id, client_id=client.id, user_id=user.id, is_primary=is_primary)
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


async def make_conversation(
    db: AsyncSession,
    *,
    agency: Agency,
    creator: User,
    others: list[User],
    kind: str = "group",
    title: str | None = "Team chat",
    initial_message: str | None = None,
) -> Conversation:
    """Create a conversation via the real service (validates membership, seeds
    participants). ``others`` must already be members of ``agency``."""
    return await create_conversation(
        db,
        agency,
        creator=creator,
        kind=kind,
        title=title,
        participant_user_ids=[u.id for u in others],
        client_id=None,
        project_id=None,
        initial_message=initial_message,
    )


async def send_message(db: AsyncSession, *, conversation: Conversation, sender: User, body: str = "hi") -> None:
    await post_message(db, conversation, sender=sender, body=body, uploads=[])


async def make_invoice(
    db: AsyncSession,
    *,
    agency: Agency,
    created_by: User,
    client: AgencyClient | None = None,
    line_items: list[tuple[str, str, int]] | None = None,
    tax_rate_percent: str = "0",
    discount_amount_cents: int | None = None,
    discount_percent: str | None = None,
) -> Invoice:
    """Create a draft invoice via the real service. ``line_items`` is a list of
    ``(description, quantity, unit_price_cents)`` tuples; defaults to one
    $100.00 line."""
    if client is None:
        client = await make_client(db, agency=agency)

    lines = line_items or [("Consulting", "1", 10_000)]
    return await create_invoice(
        db,
        agency,
        created_by=created_by,
        client_id=client.id,
        project_id=None,
        issue_date=None,
        due_date=None,
        discount_amount_cents=discount_amount_cents,
        discount_percent=Decimal(discount_percent) if discount_percent is not None else None,
        tax_rate_percent=Decimal(tax_rate_percent),
        notes=None,
        payment_instructions=None,
        line_items=[
            LineItemInput(description=desc, quantity=Decimal(qty), unit_price_cents=price) for desc, qty, price in lines
        ],
    )


async def first_list(db: AsyncSession, project: Project) -> ProjectTaskList:
    """The left-most seeded kanban column of ``project`` ("To Do")."""
    board = await get_project_board(db, project.id)
    return board[0][0]


async def make_task(
    db: AsyncSession,
    *,
    project: Project,
    task_list: ProjectTaskList | None = None,
    title: str = "Do the thing",
) -> ProjectTask:
    """Create a task in ``task_list`` (defaulting to the project's first column)."""
    target = task_list or await first_list(db, project)
    return await create_task(
        db,
        project,
        list_id=target.id,
        title=title,
        description=None,
        due_date=None,
        assignee_id=None,
    )
