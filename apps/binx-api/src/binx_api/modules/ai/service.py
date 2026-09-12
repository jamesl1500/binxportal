"""The AI features, each a thin prompt-builder over the shared
ai/client.py::complete / complete_stream. Nothing here talks to Anthropic
directly.

- analyze_lead_website / find_prospects / suggest_project_tasks —
  structured JSON output. analyze_lead_website is used by leads/service.py
  (which owns the heuristic fallback when it raises); suggest_project_tasks
  returns suggestions for the caller to review before
  projects/service.py::bulk_create_board writes anything.
- generate_dashboard_briefing / generate_project_summary /
  generate_invoice_reminder / generate_lead_followup /
  generate_message_reply — plain-text drafts.
- assistant_reply / assistant_reply_stream — the "Ask AI" manual
  tool-calling loop over four read-only, agency-scoped search tools; the
  streaming variant yields text deltas instead of returning once.
"""

from __future__ import annotations

import json
import uuid
from asyncio import Lock
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient
from binx_api.modules.ai import client as ai_client
from binx_api.modules.ai.models import (
    FEATURE_ASSISTANT,
    FEATURE_DASHBOARD_BRIEFING,
    FEATURE_INVOICE_REMINDER,
    FEATURE_LEAD_ANALYSIS,
    FEATURE_LEAD_FOLLOWUP,
    FEATURE_LEAD_GENERATION,
    FEATURE_MESSAGE_REPLY,
    FEATURE_PROJECT_SUMMARY,
    FEATURE_PROJECT_TASKS,
    ROLE_ASSISTANT,
    ROLE_USER,
    AiConversation,
    AiConversationMessage,
    DashboardBriefing,
)
from binx_api.modules.dashboard import service as dashboard_service
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import STATUS_SENT, Invoice
from binx_api.modules.leads.models import LEAD_OPEN_STATUSES, LEAD_STATUSES, Lead
from binx_api.modules.messaging import service as messaging_service
from binx_api.modules.messaging.models import SENDER_CLIENT, Conversation
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import Project, project_statuses
from binx_api.modules.users.models import User

MAX_ASSISTANT_ITERATIONS = 6


def _money(cents: int, currency: str) -> str:
    return f"{cents / 100:,.2f} {currency}"


# ---- Lead analysis --------------------------------------------------


@dataclass
class LeadAnalysis:
    """The structured result of scoring one lead. ``leads/service.py`` persists
    each field on the Lead row; ``_heuristic_analysis`` builds the same shape
    when the AI call isn't available."""

    score: int
    summary: str
    talking_points: list[str] = field(default_factory=list)
    next_step: str | None = None
    fit: str | None = None  # strong | moderate | weak


_LEAD_ANALYSIS_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            # No `minimum`/`maximum` here — the API rejects bounds on integer
            # schema properties ("...are not supported"). Clamped client-side
            # below instead.
            "score": {"type": "integer", "description": "0-100"},
            "fit": {"type": "string", "enum": ["strong", "moderate", "weak"]},
            "summary": {"type": "string"},
            "talking_points": {"type": "array", "items": {"type": "string"}},
            "next_step": {"type": "string"},
        },
        "required": ["score", "fit", "summary", "talking_points", "next_step"],
        "additionalProperties": False,
    },
}


async def analyze_lead_website(
    db: AsyncSession, lead: Lead, agency: Agency, *, actor: User | None, lock: Lock | None = None
) -> LeadAnalysis:
    """Score a lead 0-100, read its fit, and write a short summary + talking
    points + next step — fetching the lead's own website for real signal when
    one is on file. Tuned for speed: `effort="low"` and a tight token budget,
    since structured scoring doesn't need deep reasoning. Raises on any AI
    failure (not configured, over budget, malformed response) — the caller
    (leads/service.py::analyze_lead) catches that and falls back to the
    completeness heuristic, so a lead is never left unanalyzed.

    ``lock`` is a passthrough to ``ai_client.complete()`` — see its
    docstring. Only ``leads/service.py::analyze_open_leads``'s bulk path
    passes one, to run several of these concurrently on one shared
    ``AsyncSession``."""
    contact_bits = ", ".join(filter(None, [lead.contact_name, lead.contact_email, lead.contact_phone]))
    value = f"${lead.estimated_value_cents / 100:,.0f}" if lead.estimated_value_cents else "unknown"

    prompt = (
        f'You\'re helping the sales team at "{agency.name}" (a services agency) evaluate a sales lead.\n\n'
        f"Lead: {lead.name}\n"
        f"Website: {lead.website or 'none on file'}\n"
        f"Contact: {contact_bits or 'none on file'}\n"
        f"Estimated deal value: {value}\n"
        f"Pipeline status: {lead.status}\n"
        f"Notes on file: {lead.notes or 'none'}\n\n"
    )
    tools = None
    if lead.website:
        prompt += (
            f"You MUST call the web_fetch tool exactly once on {lead.website} before answering. Use what "
            "it actually returns — what the company does, who they serve, any signal of budget or "
            "urgency — to ground your analysis. If the fetch fails or the site doesn't resolve, say so "
            "plainly rather than guessing. Don't invent details the site doesn't support.\n\n"
        )
        # The plain (non-dynamic-filtering) web_fetch: dynamic filtering
        # (web_fetch_20260209) routes the fetch through a code-execution
        # sandbox the model can choose to skip, which was silently failing
        # to fetch at all some of the time and, when it did fetch, took
        # 2-5x longer (a code container spin-up on top of the fetch) for a
        # single-page read that never needed filtering in the first place.
        # `max_content_tokens` caps a sprawling site so one fetch can't
        # dominate latency or cost.
        tools = [{"type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 1, "max_content_tokens": 4000}]
    prompt += (
        "Score this lead 0-100 on how promising it is to pursue (fit, budget signal, and how "
        "complete the record is), give an overall fit of strong/moderate/weak, write a 2-3 "
        "sentence summary, list 2-4 short talking points for the first call, and suggest one "
        "concrete next step."
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_LEAD_ANALYSIS,
        system="You are a sharp, concise B2B sales analyst. Be specific, never generic filler.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=700,
        effort="low",
        tools=tools,
        response_format=_LEAD_ANALYSIS_FORMAT,
        lock=lock,
    )
    data = json.loads(result.text)
    fit = str(data.get("fit") or "").strip().lower()
    return LeadAnalysis(
        score=max(0, min(100, int(data["score"]))),
        summary=str(data["summary"]).strip(),
        talking_points=[str(p).strip() for p in (data.get("talking_points") or []) if str(p).strip()],
        next_step=(str(data.get("next_step") or "").strip() or None),
        fit=fit if fit in ("strong", "moderate", "weak") else None,
    )


# ---- Lead generation (AI prospector) --------------------------------


@dataclass
class ProspectCandidate:
    name: str
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    estimated_value_cents: int | None = None
    rationale: str | None = None


_PROSPECTS_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "website": {"type": "string"},
                        "contact_email": {"type": "string"},
                        "contact_phone": {"type": "string"},
                        "estimated_value_cents": {"type": "integer"},
                        "rationale": {"type": "string"},
                    },
                    "required": ["name", "rationale"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["candidates"],
        "additionalProperties": False,
    },
}


async def find_prospects(
    db: AsyncSession, agency: Agency, *, actor: User | None, brief: dict
) -> list[ProspectCandidate]:
    """Use web search to find real companies matching a prospecting brief.
    Returns candidates for the caller to review — nothing is persisted here.
    Raises like the other AI features on any failure."""
    count = max(1, min(10, int(brief.get("count") or 5)))
    lines = [
        f'Agency: "{agency.name}" (a services agency looking for new clients).',
        f"Industry / vertical: {brief.get('industry') or 'any'}",
        f"Location: {brief.get('location') or 'any'}",
        f"Company size: {brief.get('company_size') or 'any'}",
        f"Keywords / what they'd need: {brief.get('keywords') or '(none given)'}",
        f"How many to return: {count}",
    ]
    prompt = (
        "Find real companies that would be a good fit as prospective clients for this agency, "
        "using web search. Only include companies you actually find in search results, with their "
        "real website URL. Never invent contact details — leave email/phone out unless the search "
        "surfaces them. Give each a one-sentence rationale for why they fit, and a rough estimated "
        "first-project value in cents if you can justify one. If search turns up little, return "
        "fewer rather than padding with guesses.\n\n" + "\n".join(lines)
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_LEAD_GENERATION,
        system="You are a B2B prospecting researcher. Ground every company in real search results.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2500,
        effort="medium",
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}],
        response_format=_PROSPECTS_FORMAT,
    )

    def _trimmed(raw: dict, key: str, length: int) -> str | None:
        value = str(raw.get(key) or "").strip()[:length]
        return value or None

    data = json.loads(result.text)
    candidates: list[ProspectCandidate] = []
    for raw in (data.get("candidates") or [])[:count]:
        name = _trimmed(raw, "name", 255)
        if not name:
            continue
        value = raw.get("estimated_value_cents")
        candidates.append(
            ProspectCandidate(
                name=name,
                website=_trimmed(raw, "website", 2048),
                contact_email=_trimmed(raw, "contact_email", 255),
                contact_phone=_trimmed(raw, "contact_phone", 32),
                estimated_value_cents=max(0, int(value)) if isinstance(value, int | float) else None,
                rationale=_trimmed(raw, "rationale", 1000),
            )
        )
    return candidates


# ---- Lead follow-up email draft ---------------------------------------


async def generate_lead_followup(db: AsyncSession, lead: Lead, agency: Agency, *, actor: User | None) -> str:
    """Draft a follow-up email for a lead still in play. Structurally the
    same as generate_invoice_reminder: a guard, a plain-text prompt built
    from what's already on file, one fast-tier call. Grounds the draft in
    any existing analyze_lead_website output (ai_summary/ai_next_step)
    without triggering a second AI call for it."""
    if lead.status not in LEAD_OPEN_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This lead is closed — no follow-up needed.")

    contact_bits = ", ".join(filter(None, [lead.contact_name, lead.contact_email, lead.contact_phone]))
    last_activity = lead.last_activity_at.date().isoformat() if lead.last_activity_at else "no activity logged"

    prompt = (
        f'Draft a follow-up email for the sales lead "{lead.name}" on behalf of "{agency.name}".\n'
        f"Contact: {contact_bits or 'none on file'}\n"
        f"Pipeline status: {lead.status}\n"
        f"Last activity: {last_activity}\n"
        f"Notes on file: {lead.notes or 'none'}\n"
    )
    if lead.ai_summary:
        prompt += f"Prior analysis summary: {lead.ai_summary}\n"
    if lead.ai_next_step:
        prompt += f"Suggested next step: {lead.ai_next_step}\n"
    prompt += (
        "\nWrite a brief, warm, no-pressure check-in email — professional, not pushy. Reference what's "
        "known above only; don't invent specifics. Write only the email body — no subject line, no "
        "signature block."
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_LEAD_FOLLOWUP,
        system="You write concise, warm follow-up emails for a B2B sales pipeline.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        effort="low",
        fast=True,
    )
    return result.text


# ---- Dashboard briefing ----------------------------------------------


async def generate_dashboard_briefing(db: AsyncSession, agency: Agency, user: User) -> str:
    # Local import: leads/service.py imports ai/service.py for the analyze_lead
    # seam, so importing leads.service at module level here would be circular.
    from binx_api.modules.leads import service as leads_service

    my_work = await dashboard_service.my_work(db, agency.id, user.id)
    lead_rows = await leads_service.list_leads(db, agency.id)
    open_leads = [lead for lead, _owner, _client in lead_rows if lead.status in LEAD_OPEN_STATUSES]
    overdue_invoices = await invoicing_service.list_invoices(db, agency.id, status_filter="overdue")
    recent = await activity_service.list_agency_activity(db, agency.id, viewer_is_admin=True, limit=8)

    lines = [
        f"{user.full_name}'s open tasks: {my_work.total_open} total, "
        f"{my_work.overdue_count} overdue, {my_work.due_soon_count} due within 7 days.",
    ]
    for task in my_work.tasks[:5]:
        due = task.due_date.isoformat() if task.due_date else "no due date"
        lines.append(f"  - {task.title} ({task.project_name}, due {due}{', OVERDUE' if task.overdue else ''})")

    lines.append(f"\nOpen leads: {len(open_leads)}.")
    for lead in open_leads[:5]:
        score = f"score {lead.score}" if lead.score is not None else "unscored"
        lines.append(f"  - {lead.name} ({lead.status}, {score})")

    lines.append(f"\nOverdue invoices: {len(overdue_invoices)}.")
    for invoice, client_name, _project_name in overdue_invoices[:5]:
        due_cents = invoice.total_cents - invoice.amount_paid_cents
        overdue_since = invoice.due_date.isoformat()
        amount = _money(due_cents, invoice.currency)
        lines.append(f"  - {invoice.number} for {client_name}: {amount} overdue since {overdue_since}")

    if recent:
        lines.append("\nRecent agency activity:")
        for entry in recent[:6]:
            lines.append(f"  - {entry.summary}")

    fact_sheet = "\n".join(lines)
    result = await ai_client.complete(
        db,
        agency.id,
        user.id,
        feature=FEATURE_DASHBOARD_BRIEFING,
        system=(
            "You write short daily briefings for someone at a creative/marketing agency, based only "
            "on the facts given. Be warm but efficient — no filler, no restating the obvious."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Here's today's state of things for {user.full_name} at {agency.name}:\n\n{fact_sheet}\n\n"
                    "Write a 3-5 sentence briefing, then a short bulleted 'Do next' list (2-4 items) of "
                    "the most important things to act on today. Only reference facts given above."
                ),
            }
        ],
        max_tokens=700,
        effort="medium",
        fast=True,
    )
    return result.text


async def get_dashboard_briefing(db: AsyncSession, agency: Agency, user: User, *, force: bool = False) -> str:
    """Cache-aware wrapper around ``generate_dashboard_briefing`` — one row
    per (agency, member, UTC day) in ``dashboard_briefings``. The dashboard
    page used to call Claude fresh on every render; this is what makes the
    second-and-later load in a day free, instant, and silent against the
    agency's AI budget. ``force=True`` (the Refresh button) regenerates and
    overwrites today's row regardless of whether one already exists."""
    today = datetime.now(UTC).date()
    existing = (
        await db.execute(
            select(DashboardBriefing).where(
                DashboardBriefing.agency_id == agency.id,
                DashboardBriefing.user_id == user.id,
                DashboardBriefing.briefing_date == today,
            )
        )
    ).scalar_one_or_none()
    if existing is not None and not force:
        return existing.content

    text = await generate_dashboard_briefing(db, agency, user)
    if existing is not None:
        existing.content = text
    else:
        db.add(DashboardBriefing(agency_id=agency.id, user_id=user.id, briefing_date=today, content=text))
    await db.commit()
    return text


# ---- Project summary ---------------------------------------------------


async def generate_project_summary(db: AsyncSession, project: Project, agency: Agency, *, actor: User | None) -> str:
    board = await projects_service.get_project_board(db, project.id)
    column_lines = []
    for task_list, tasks in board:
        titles = [task.title for task, *_rest in tasks]
        shown = ", ".join(titles[:12]) if titles else "(empty)"
        column_lines.append(f"{task_list.name} ({len(titles)}): {shown}")

    prompt = (
        f'Write a short, client-ready status update for the project "{project.name}" '
        f"(internal status: {project.status}).\n"
        f"Description: {project.description or 'none on file'}\n\n"
        "Board:\n" + "\n".join(column_lines) + "\n\n"
        "Write 3-5 sentences a client would be glad to receive: what's been done, what's in "
        "progress, and what's coming next. Prose only — no headers, no bullet points. Don't invent "
        "specifics beyond what's listed above."
    )
    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_PROJECT_SUMMARY,
        system="You write clear, warm client-facing project updates for a creative/marketing agency.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        effort="medium",
        fast=True,
    )
    return result.text


# ---- Project starter task list ----------------------------------------


@dataclass
class TaskSuggestion:
    title: str
    description: str | None = None


@dataclass
class TaskListSuggestion:
    name: str
    tasks: list[TaskSuggestion] = field(default_factory=list)


_PROJECT_TASKS_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "lists": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "tasks": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "description": {"type": "string"},
                                },
                                "required": ["title"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["name", "tasks"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["lists"],
        "additionalProperties": False,
    },
}


async def suggest_project_tasks(
    db: AsyncSession, project: Project, agency: Agency, *, actor: User | None
) -> list[TaskListSuggestion]:
    """Propose a starter kanban board (columns + cards) for a freshly created
    project, from just its name/description — the opposite direction of
    generate_project_summary (propose structure instead of summarizing
    existing work). Returns suggestions for the caller to review/edit; never
    writes to the DB itself (see projects/service.py::bulk_create_board for
    that)."""
    prompt = (
        f'Propose a starter kanban task board for the project "{project.name}" at "{agency.name}" '
        "(a services agency).\n"
        f"Description: {project.description or 'none on file'}\n\n"
        "Suggest 2-4 columns (e.g. a typical workflow for this kind of project) and, under each, "
        "3-6 concrete starter tasks with short titles and a one-sentence description each. Keep it "
        "practical and specific to what's described above — don't pad with generic boilerplate tasks "
        "if the description doesn't support them."
    )
    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_PROJECT_TASKS,
        system="You are a delivery lead at a creative/marketing agency, setting up new project boards.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        effort="low",
        response_format=_PROJECT_TASKS_FORMAT,
        fast=True,
    )
    data = json.loads(result.text)
    lists: list[TaskListSuggestion] = []
    for raw_list in data.get("lists") or []:
        name = str(raw_list.get("name") or "").strip()[:100]
        if not name:
            continue
        tasks = []
        for raw_task in raw_list.get("tasks") or []:
            title = str(raw_task.get("title") or "").strip()[:255]
            if not title:
                continue
            description = str(raw_task.get("description") or "").strip()[:4096] or None
            tasks.append(TaskSuggestion(title=title, description=description))
        if tasks:
            lists.append(TaskListSuggestion(name=name, tasks=tasks))
    return lists


# ---- Invoice reminder ----------------------------------------------


async def generate_invoice_reminder(db: AsyncSession, invoice: Invoice, agency: Agency, *, actor: User | None) -> str:
    if invoice.status != STATUS_SENT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only a sent invoice can get a reminder drafted.")

    client = await db.get(AgencyClient, invoice.client_id)
    client_name = client.name if client else "the client"
    today = datetime.now(UTC).date()
    days_overdue = (today - invoice.due_date).days
    due_cents = invoice.total_cents - invoice.amount_paid_cents

    prompt = (
        f"Draft a payment reminder email for invoice {invoice.number} from {agency.name} to {client_name}.\n"
        f"Amount due: {_money(due_cents, invoice.currency)}\n"
        f"Due date: {invoice.due_date.isoformat()}"
        + (f" — {days_overdue} day{'s' if days_overdue != 1 else ''} overdue" if days_overdue > 0 else " (not yet due)")
        + "\n\n"
        "Write a friendly-but-firm reminder: professional, brief, no guilt-tripping. State the amount "
        "and due date plainly, ask clearly for payment, and offer to answer any questions. Write only "
        "the email body — no subject line, no signature block."
    )
    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_INVOICE_REMINDER,
        system="You write concise, professional payment-reminder emails on behalf of a small agency.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=400,
        effort="low",
        fast=True,
    )
    return result.text


# ---- Message reply draft ------------------------------------------------


async def generate_message_reply(
    db: AsyncSession, conversation: Conversation, agency: Agency, *, actor: User | None
) -> str:
    """Draft a reply to the client's most recent message in a staff/client
    conversation. Guard: 400 when there's no client message to reply to yet
    (an empty thread, or the newest message is already staff's own) — mirrors
    generate_invoice_reminder's guard shape. Reuses
    messaging/service.py::list_messages wholesale for the history fetch."""
    history = await messaging_service.list_messages(db, conversation, limit=15, before=None)
    if not history or history[-1].sender_kind != SENDER_CLIENT or history[-1].deleted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "There's no new client message to reply to.")

    lines = [
        f"{'Client' if message.sender_kind == SENDER_CLIENT else message.sender_name}: {message.body}"
        for message in history
        if message.deleted_at is None
    ]
    prompt = (
        f'Draft a reply to the client\'s most recent message in this conversation with "{agency.name}".\n\n'
        "Conversation so far (oldest first):\n" + "\n".join(lines) + "\n\n"
        "Write a warm, professional reply that directly addresses the client's most recent message. "
        "Don't invent facts not present above. Write only the message body — no signature block."
    )

    result = await ai_client.complete(
        db,
        agency.id,
        actor.id if actor else None,
        feature=FEATURE_MESSAGE_REPLY,
        system="You write clear, warm client-facing replies on behalf of a creative/marketing agency.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
        effort="low",
        fast=True,
    )
    return result.text


# ---- Ask AI assistant ------------------------------------------------

_ASSISTANT_TOOLS = [
    {
        "name": "search_leads",
        "description": "Search this agency's sales leads (prospects not yet converted to clients).",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Case-insensitive substring to match against the name"},
                "status": {"type": "string", "enum": LEAD_STATUSES},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "search_clients",
        "description": "Search this agency's clients.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Case-insensitive substring to match against the name"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "search_projects",
        "description": "Search this agency's projects.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Case-insensitive substring to match against the name"},
                "status": {"type": "string", "enum": project_statuses},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
    {
        "name": "search_invoices",
        "description": "Search this agency's invoices, including which are overdue or partially paid.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["draft", "sent", "paid", "void", "overdue", "partial"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
        },
    },
]


def _invoice_status_label(invoice: Invoice, today: datetime) -> str:
    """A small, local re-derivation of invoicing/service.py's private
    ``_display_status`` — kept in sync by hand rather than reaching across
    the module boundary for one label."""
    if invoice.status != STATUS_SENT:
        return invoice.status
    due_cents = invoice.total_cents - invoice.amount_paid_cents
    if due_cents > 0 and invoice.due_date < today:
        return "overdue"
    if 0 < invoice.amount_paid_cents < invoice.total_cents:
        return "partial"
    return STATUS_SENT


async def _run_tool(db: AsyncSession, agency_id: uuid.UUID, name: str, tool_input: dict) -> object:
    limit = min(max(int(tool_input.get("limit") or 10), 1), 20)
    query = (tool_input.get("query") or "").strip().lower()

    if name == "search_leads":
        from binx_api.modules.leads import service as leads_service  # see generate_dashboard_briefing

        rows = await leads_service.list_leads(db, agency_id, status_filter=tool_input.get("status"))
        matches = [lead for lead, _owner, _client in rows if not query or query in lead.name.lower()]
        return [
            {
                "name": lead.name,
                "status": lead.status,
                "score": lead.score,
                "estimated_value_cents": lead.estimated_value_cents,
                "website": lead.website,
            }
            for lead in matches[:limit]
        ]

    if name == "search_clients":
        clients = await agencies_service.list_clients(db, agency_id)
        matches = [c for c in clients if not query or query in c.name.lower()]
        return [
            {"name": c.name, "is_active": c.is_active, "primary_contact_email": c.primary_contact_email}
            for c in matches[:limit]
        ]

    if name == "search_projects":
        rows = await projects_service.list_projects_for_agency(db, agency_id, status_filter=tool_input.get("status"))
        matches = [(p, client_name) for p, client_name, _members in rows if not query or query in p.name.lower()]
        return [
            {
                "name": p.name,
                "status": p.status,
                "client": client_name,
                "due_date": p.due_date.isoformat() if p.due_date else None,
            }
            for p, client_name in matches[:limit]
        ]

    if name == "search_invoices":
        raw_status = tool_input.get("status")
        # "overdue"/"partial" are derived labels, not stored ones — filter on
        # the stored status and let list_invoices' own derived-status match
        # narrow it further when one of those was requested.
        status_filter = raw_status if raw_status in ("draft", "sent", "paid", "void") else None
        rows = await invoicing_service.list_invoices(db, agency_id, status_filter=status_filter)
        today = datetime.now(UTC).date()
        items = []
        for invoice, client_name, _project_name in rows:
            label = _invoice_status_label(invoice, today)
            if raw_status and label != raw_status:
                continue
            due_cents = invoice.total_cents - invoice.amount_paid_cents
            items.append(
                {
                    "number": invoice.number,
                    "client": client_name,
                    "status": label,
                    "total": _money(invoice.total_cents, invoice.currency),
                    "amount_due": _money(due_cents, invoice.currency),
                    "due_date": invoice.due_date.isoformat(),
                }
            )
        return items[:limit]

    return {"error": f"Unknown tool '{name}'"}


async def list_conversations(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> list[AiConversation]:
    result = await db.execute(
        select(AiConversation)
        .where(AiConversation.agency_id == agency_id, AiConversation.user_id == user_id)
        .order_by(AiConversation.created_at.desc())
    )
    return list(result.scalars().all())


async def create_conversation(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> AiConversation:
    conversation = AiConversation(agency_id=agency_id, user_id=user_id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def get_conversation_or_404(
    db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID, conversation_id: uuid.UUID
) -> AiConversation:
    result = await db.execute(
        select(AiConversation).where(
            AiConversation.id == conversation_id,
            AiConversation.agency_id == agency_id,
            AiConversation.user_id == user_id,
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


async def list_conversation_messages(db: AsyncSession, conversation_id: uuid.UUID) -> list[AiConversationMessage]:
    result = await db.execute(
        select(AiConversationMessage)
        .where(AiConversationMessage.conversation_id == conversation_id)
        .order_by(AiConversationMessage.created_at)
    )
    return list(result.scalars().all())


async def delete_conversation(db: AsyncSession, conversation: AiConversation) -> None:
    await db.delete(conversation)
    await db.commit()


def _assistant_system_prompt(agency: Agency) -> str:
    return (
        f'You are Binx\'s in-app AI assistant for the agency "{agency.name}". Answer questions about '
        "their leads, clients, projects, and invoices using the tools available — always look things "
        "up rather than guessing at numbers or statuses. Be concise and specific. You are read-only: "
        "you cannot create, edit, send, or change anything on the user's behalf."
    )


async def _build_assistant_messages(db: AsyncSession, conversation: AiConversation, user_message: str) -> list[dict]:
    history = await list_conversation_messages(db, conversation.id)
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": user_message})
    return messages


async def _execute_tool_calls(db: AsyncSession, agency_id: uuid.UUID, message) -> list[dict]:
    """Runs every ``tool_use`` block in one assistant message and returns all
    their results as a list of ``tool_result`` blocks for a single user
    message — never split across messages (that silently trains Claude to
    stop making parallel tool calls)."""
    tool_results = []
    for block in message.content:
        if block.type != "tool_use":
            continue
        try:
            output = await _run_tool(db, agency_id, block.name, block.input or {})
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(output)})
        except Exception as exc:  # a bad tool call shouldn't kill the whole turn
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(exc), "is_error": True})
    return tool_results


async def _persist_assistant_turn(
    db: AsyncSession, conversation: AiConversation, *, user_message: str, final_text: str
) -> None:
    db.add(AiConversationMessage(conversation_id=conversation.id, role=ROLE_USER, content=user_message))
    db.add(AiConversationMessage(conversation_id=conversation.id, role=ROLE_ASSISTANT, content=final_text))
    if conversation.title is None:
        conversation.title = user_message[:255]
    await db.commit()


_NO_ANSWER = "I wasn't able to finish looking that up — try narrowing your question."


async def assistant_reply(
    db: AsyncSession, conversation: AiConversation, agency: Agency, *, actor: User, user_message: str
) -> str:
    messages = await _build_assistant_messages(db, conversation, user_message)
    system = _assistant_system_prompt(agency)

    final_text = _NO_ANSWER
    for _iteration in range(MAX_ASSISTANT_ITERATIONS):
        result = await ai_client.complete(
            db,
            agency.id,
            actor.id,
            feature=FEATURE_ASSISTANT,
            system=system,
            messages=messages,
            max_tokens=1200,
            effort="medium",
            tools=_ASSISTANT_TOOLS,
            cache_system=True,
        )
        message = result.message
        if message.stop_reason != "tool_use":
            final_text = result.text or final_text
            break

        messages.append({"role": "assistant", "content": message.content})
        tool_results = await _execute_tool_calls(db, agency.id, message)
        messages.append({"role": "user", "content": tool_results})

    await _persist_assistant_turn(db, conversation, user_message=user_message, final_text=final_text)
    return final_text


async def assistant_reply_stream(
    db: AsyncSession, conversation: AiConversation, agency: Agency, *, actor: User, user_message: str
) -> AsyncIterator[str]:
    """Streaming counterpart to :func:`assistant_reply` — the exact same
    tool loop (still capped at ``MAX_ASSISTANT_ITERATIONS``, still runs every
    ``tool_use`` block from one message and returns all results in one user
    message) and the exact same persistence (one commit at the end, same two
    ``AiConversationMessage`` rows) — only the client-visible delivery is
    incremental: yields text deltas as each iteration's reply is generated
    instead of returning the finished text once. An iteration that's purely
    a tool call yields no deltas (nothing to show yet), so what streams to
    the user is naturally just the assistant's visible reasoning and its
    final answer."""
    messages = await _build_assistant_messages(db, conversation, user_message)
    system = _assistant_system_prompt(agency)

    final_text = _NO_ANSWER
    for _iteration in range(MAX_ASSISTANT_ITERATIONS):
        message = None
        turn_text = ""
        async for event in ai_client.complete_stream(
            db,
            agency.id,
            actor.id,
            feature=FEATURE_ASSISTANT,
            system=system,
            messages=messages,
            max_tokens=1200,
            effort="medium",
            tools=_ASSISTANT_TOOLS,
            cache_system=True,
        ):
            if isinstance(event, ai_client.TextDelta):
                turn_text += event.text
                yield event.text
            else:
                message = event.message

        assert message is not None  # complete_stream always ends with a TurnComplete
        if message.stop_reason != "tool_use":
            final_text = turn_text or final_text
            break

        messages.append({"role": "assistant", "content": message.content})
        tool_results = await _execute_tool_calls(db, agency.id, message)
        messages.append({"role": "user", "content": tool_results})

    await _persist_assistant_turn(db, conversation, user_message=user_message, final_text=final_text)
